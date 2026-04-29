import crypto from 'crypto'
import { Router, Request } from 'express'
import { db } from '../db'
import { invoices, lineItems, clients, users } from '../db/schema'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import {
  eq,
  and,
  desc,
  gte,
  lte,
  gt,
  count,
  getTableColumns,
} from 'drizzle-orm'
import { consumeInvoiceCredit, InvoiceLimitReachedError } from '../utils/freeTierGate'
import { generateInvoiceNumber } from '../utils/invoiceNumber'
import { fromCents, calcVatCents, VAT_RATE_PERCENT } from '../utils/money'
import { formatZAR } from '../utils/formatZAR'
import { generateInvoicePDF, PdfInvoiceData } from '../services/pdf'
import { CreateInvoiceSchema, SendInvoiceSchema } from '@invoicekasi/shared'
import type { CreateInvoice, SendInvoice, InvoiceResponse, SendInvoiceResponse } from '@invoicekasi/shared'

const router = Router()

// ─── Local alias for the validated invoice body ────────────────────────────────

const InvoiceBodySchema = CreateInvoiceSchema
type InvoiceBody = CreateInvoice

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  vatEnabled: boolean,
) {
  const lineCents = items.map((item) => {
    const qtyHundredths = Math.round(item.quantity * 100)
    const priceCents = Math.round(item.unitPrice * 100)
    return Math.round((qtyHundredths * priceCents) / 100)
  })
  const subtotalCents = lineCents.reduce((s, c) => s + c, 0)
  const vatCents = calcVatCents(subtotalCents, vatEnabled)
  const totalCents = subtotalCents + vatCents
  return {
    subtotal: fromCents(subtotalCents),
    vatRate: vatEnabled ? VAT_RATE_PERCENT : 0,
    vatAmount: fromCents(vatCents),
    total: fromCents(totalCents),
    lineTotals: lineCents.map(fromCents),
  }
}

// Drizzle returns numeric columns as strings and timestamps as Date — normalize to wire format.
function numericInvoice(inv: typeof invoices.$inferSelect) {
  return {
    ...inv,
    type: inv.type as InvoiceResponse['type'],
    status: inv.status as InvoiceResponse['status'],
    subtotal: parseFloat(inv.subtotal ?? '0'),
    vatRate: parseFloat(inv.vatRate ?? '0'),
    vatAmount: parseFloat(inv.vatAmount ?? '0'),
    total: parseFloat(inv.total ?? '0'),
    sentAt: inv.sentAt?.toISOString() ?? null,
    viewedAt: inv.viewedAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    createdAt: (inv.createdAt ?? new Date()).toISOString(),
    updatedAt: inv.updatedAt?.toISOString() ?? null,
  }
}

function numericLineItem(item: typeof lineItems.$inferSelect) {
  return {
    ...item,
    quantity: parseFloat(item.quantity ?? '1'),
    unitPrice: parseFloat(item.unitPrice ?? '0'),
    lineTotal: parseFloat(item.lineTotal ?? '0'),
  }
}

// ─── Public endpoint — NO AUTH ────────────────────────────────────────────────
// Must be registered BEFORE router.use(requireAuth)

router.get('/:id/public', async (req: Request, res) => {
  const id = req.params['id'] as string
  const t = req.query['t'] as string | undefined

  if (!t) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, id),
        eq(invoices.publicToken, t),
        gt(invoices.publicTokenExpiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const [items, ownerRows, clientRows] = await Promise.all([
    db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, id))
      .orderBy(lineItems.sortOrder),
    db
      .select({
        businessName: users.businessName,
        logoUrl: users.logoUrl,
        addressLine1: users.addressLine1,
        addressLine2: users.addressLine2,
        city: users.city,
        province: users.province,
        postalCode: users.postalCode,
        vatNumber: users.vatNumber,
        bankName: users.bankName,
        bankAccountNumber: users.bankAccountNumber,
        bankBranchCode: users.bankBranchCode,
      })
      .from(users)
      .where(eq(users.id, invoice.userId))
      .limit(1),
    invoice.clientId
      ? db
          .select({
            id: clients.id,
            name: clients.name,
            email: clients.email,
            phoneWhatsapp: clients.phoneWhatsapp,
          })
          .from(clients)
          .where(eq(clients.id, invoice.clientId))
          .limit(1)
      : Promise.resolve([]),
  ])

  // Tracking: first view after sending flips status to 'viewed'
  let returnedInvoice = invoice
  if (invoice.status === 'sent') {
    const now = new Date()
    await db
      .update(invoices)
      .set({ status: 'viewed', viewedAt: now, updatedAt: now })
      .where(eq(invoices.id, id))
    returnedInvoice = { ...invoice, status: 'viewed', viewedAt: now }
  }

  const payload: InvoiceResponse = {
    ...numericInvoice(returnedInvoice),
    lineItems: items.map(numericLineItem),
    business: ownerRows[0] ?? null,
    client: clientRows[0] ?? null,
  }
  res.json(payload)
})

// ─── GET /api/invoices/:id/public/pdf — NO auth ───────────────────────────────

router.get('/:id/public/pdf', async (req: Request, res) => {
  const id = req.params['id'] as string
  const t = req.query['t'] as string | undefined

  if (!t) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, id),
        eq(invoices.publicToken, t),
        gt(invoices.publicTokenExpiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const [items, clientRows, ownerRows] = await Promise.all([
    db.select().from(lineItems).where(eq(lineItems.invoiceId, id)).orderBy(lineItems.sortOrder),
    invoice.clientId
      ? db
          .select({ name: clients.name, email: clients.email, phoneWhatsapp: clients.phoneWhatsapp })
          .from(clients)
          .where(eq(clients.id, invoice.clientId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        businessName: users.businessName,
        addressLine1: users.addressLine1,
        addressLine2: users.addressLine2,
        city: users.city,
        province: users.province,
        postalCode: users.postalCode,
        vatNumber: users.vatNumber,
        bankName: users.bankName,
        bankAccountNumber: users.bankAccountNumber,
        bankBranchCode: users.bankBranchCode,
      })
      .from(users)
      .where(eq(users.id, invoice.userId))
      .limit(1),
  ])

  const pdfData: PdfInvoiceData = {
    invoice: numericInvoice(invoice),
    lineItems: items.map(numericLineItem),
    client: clientRows[0] ?? null,
    business: ownerRows[0] ?? null,
  }

  try {
    const buffer = await generateInvoicePDF(pdfData)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`)
    res.send(buffer)
  } catch (err) {
    console.error('PDF generation failed:', err)
    res.status(500).json({ error: 'Failed to generate PDF' })
  }
})

// ─── All routes below require JWT auth ───────────────────────────────────────

router.use(requireAuth)

// ─── GET /api/invoices/:id/pdf — auth required ────────────────────────────────

router.get('/:id/pdf', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const [items, clientRows, ownerRows] = await Promise.all([
    db.select().from(lineItems).where(eq(lineItems.invoiceId, id)).orderBy(lineItems.sortOrder),
    invoice.clientId
      ? db
          .select({ name: clients.name, email: clients.email, phoneWhatsapp: clients.phoneWhatsapp })
          .from(clients)
          .where(eq(clients.id, invoice.clientId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        businessName: users.businessName,
        addressLine1: users.addressLine1,
        addressLine2: users.addressLine2,
        city: users.city,
        province: users.province,
        postalCode: users.postalCode,
        vatNumber: users.vatNumber,
        bankName: users.bankName,
        bankAccountNumber: users.bankAccountNumber,
        bankBranchCode: users.bankBranchCode,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ])

  const pdfData: PdfInvoiceData = {
    invoice: numericInvoice(invoice),
    lineItems: items.map(numericLineItem),
    client: clientRows[0] ?? null,
    business: ownerRows[0] ?? null,
  }

  try {
    const buffer = await generateInvoicePDF(pdfData)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`)
    res.send(buffer)
  } catch (err) {
    console.error('PDF generation failed:', err)
    res.status(500).json({ error: 'Failed to generate PDF' })
  }
})

// ─── GET /api/invoices ────────────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId!
  const q = req.query as Record<string, string | undefined>
  const page = Math.max(1, parseInt(q['page'] ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(q['limit'] ?? '20', 10)))
  const offset = (page - 1) * limit

  const conditions = [
    eq(invoices.userId, userId),
    ...(q['status'] ? [eq(invoices.status, q['status'])] : []),
    ...(q['type'] ? [eq(invoices.type, q['type'])] : []),
    ...(q['client_id'] ? [eq(invoices.clientId, q['client_id'])] : []),
    ...(q['from_date'] ? [gte(invoices.createdAt, new Date(q['from_date']))] : []),
    ...(q['to_date'] ? [lte(invoices.createdAt, new Date(q['to_date']))] : []),
  ]
  const where = and(...conditions)

  const [countResult, rows] = await Promise.all([
    db.select({ count: count() }).from(invoices).where(where),
    db
      .select({
        ...getTableColumns(invoices),
        clientName: clients.name,
        clientPhoneWhatsapp: clients.phoneWhatsapp,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset),
  ])

  const total = Number(countResult[0]?.count ?? 0)

  res.json({
    invoices: rows.map(({ clientName, clientPhoneWhatsapp, ...inv }) => ({
      ...numericInvoice(inv as typeof invoices.$inferSelect),
      clientName: clientName ?? null,
      clientPhoneWhatsapp: clientPhoneWhatsapp ?? null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  })
})

// ─── GET /api/invoices/:id ────────────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const [items, clientRows, ownerRows] = await Promise.all([
    db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, id))
      .orderBy(lineItems.sortOrder),
    invoice.clientId
      ? db
          .select({
            id: clients.id,
            name: clients.name,
            email: clients.email,
            phoneWhatsapp: clients.phoneWhatsapp,
          })
          .from(clients)
          .where(eq(clients.id, invoice.clientId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        businessName: users.businessName,
        logoUrl: users.logoUrl,
        addressLine1: users.addressLine1,
        addressLine2: users.addressLine2,
        city: users.city,
        province: users.province,
        postalCode: users.postalCode,
        vatNumber: users.vatNumber,
        bankName: users.bankName,
        bankAccountNumber: users.bankAccountNumber,
        bankBranchCode: users.bankBranchCode,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ])

  const payload: InvoiceResponse = {
    ...numericInvoice(invoice),
    lineItems: items.map(numericLineItem),
    client: clientRows[0] ?? null,
    business: ownerRows[0] ?? null,
  }
  res.json(payload)
})

// ─── POST /api/invoices ───────────────────────────────────────────────────────

router.post('/', validateBody(InvoiceBodySchema), async (req: AuthRequest, res) => {
  const userId = req.userId!
  const body = req.body as InvoiceBody

  // Validate client ownership
  const [ownedClient] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(eq(clients.id, body.clientId), eq(clients.userId, userId), eq(clients.isDeleted, false)),
    )
    .limit(1)

  if (!ownedClient) {
    res.status(400).json({ error: 'Client not found or does not belong to you' })
    return
  }

  const { subtotal, vatRate, vatAmount, total, lineTotals } = calcTotals(
    body.lineItems,
    body.vatEnabled,
  )

  try {
    const result = await db.transaction(async (tx) => {
      const credit = await consumeInvoiceCredit(tx, userId)
      if (!credit.ok) throw new InvoiceLimitReachedError()

      const invoiceNumber = await generateInvoiceNumber(tx, userId, body.type)

      const [invoice] = await tx
        .insert(invoices)
        .values({
          userId,
          clientId: body.clientId,
          invoiceNumber,
          type: body.type,
          vatRate: String(vatRate),
          subtotal: String(subtotal),
          vatAmount: String(vatAmount),
          total: String(total),
          dueDate: body.dueDate ?? null,
          notes: body.notes ?? null,
        })
        .returning()

      await tx.insert(lineItems).values(
        body.lineItems.map((item, idx) => ({
          invoiceId: invoice.id,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          lineTotal: String(lineTotals[idx]),
          sortOrder: item.sortOrder ?? idx,
        })),
      )

      return invoice
    })

    const items = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, result.id))
      .orderBy(lineItems.sortOrder)

    const payload: InvoiceResponse = {
      ...numericInvoice(result),
      lineItems: items.map(numericLineItem),
    }
    res.status(201).json(payload)
  } catch (err) {
    if (err instanceof InvoiceLimitReachedError) {
      res.status(403).json({
        error: 'Free plan limited to 10 invoices per month. Upgrade to Premium for unlimited invoicing.',
        code: 'INVOICE_LIMIT_REACHED',
      })
      return
    }
    throw err
  }
})

// ─── PUT /api/invoices/:id ────────────────────────────────────────────────────

router.put('/:id', validateBody(InvoiceBodySchema), async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!
  const body = req.body as InvoiceBody

  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!existing) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  if (existing.status !== 'draft') {
    res.status(400).json({ error: 'Only draft invoices can be edited' })
    return
  }

  // Validate client ownership
  const [ownedClient] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(eq(clients.id, body.clientId), eq(clients.userId, userId), eq(clients.isDeleted, false)),
    )
    .limit(1)

  if (!ownedClient) {
    res.status(400).json({ error: 'Client not found or does not belong to you' })
    return
  }

  const { subtotal, vatRate, vatAmount, total, lineTotals } = calcTotals(
    body.lineItems,
    body.vatEnabled,
  )

  const result = await db.transaction(async (tx) => {
    // Full replacement of line items
    await tx.delete(lineItems).where(eq(lineItems.invoiceId, id))

    await tx.insert(lineItems).values(
      body.lineItems.map((item, idx) => ({
        invoiceId: id,
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        lineTotal: String(lineTotals[idx]),
        sortOrder: item.sortOrder ?? idx,
      })),
    )

    const [updated] = await tx
      .update(invoices)
      .set({
        clientId: body.clientId,
        vatRate: String(vatRate),
        subtotal: String(subtotal),
        vatAmount: String(vatAmount),
        total: String(total),
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning()

    return updated
  })

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(lineItems.sortOrder)

  res.json({
    ...numericInvoice(result),
    lineItems: items.map(numericLineItem),
  })
})

// ─── DELETE /api/invoices/:id ─────────────────────────────────────────────────

router.delete('/:id', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!existing) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  if (existing.status !== 'draft') {
    res.status(400).json({ error: 'Only draft invoices can be deleted' })
    return
  }

  await db.delete(invoices).where(eq(invoices.id, id))

  res.json({ message: 'Invoice deleted' })
})

// ─── POST /api/invoices/:id/send ──────────────────────────────────────────────

router.post('/:id/send', validateBody(SendInvoiceSchema), async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!
  const body = req.body as SendInvoice

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  if (invoice.status !== 'draft' && invoice.status !== 'sent') {
    res.status(400).json({ error: 'Invoice cannot be sent in its current status' })
    return
  }

  // ── Send debounce (5 s) ──────────────────────────────────────────────────────
  if (invoice.lastSendAttemptAt && Date.now() - invoice.lastSendAttemptAt.getTime() < 5000) {
    res.status(429).json({ error: 'Send debounced — please wait a few seconds', code: 'SEND_DEBOUNCED' })
    return
  }

  const now = new Date()

  // Generate a token if the invoice doesn't have one (or its existing one expired).
  const needsToken =
    !invoice.publicToken ||
    (invoice.publicTokenExpiresAt && invoice.publicTokenExpiresAt < now)
  const tokenUpdate = needsToken
    ? {
        publicToken: crypto.randomBytes(20).toString('hex'),
        publicTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      }
    : {}

  // Stamp lastSendAttemptAt immediately so concurrent requests see the lock.
  const [updated] = await db
    .update(invoices)
    .set({ status: 'sent', sentAt: now, sentVia: body.via, lastSendAttemptAt: now, updatedAt: now, ...tokenUpdate })
    .where(eq(invoices.id, id))
    .returning()

  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'
  const activeToken = updated.publicToken ?? invoice.publicToken ?? ''
  const publicUrl = `${clientUrl}/invoice/${id}?t=${activeToken}`

  // ── Yoco checkout creation (idempotent) ──────────────────────────────────────
  const yocoKey = process.env.YOCO_SECRET_KEY
  if (yocoKey && yocoKey.trim() !== '') {
    if (!invoice.paymentLinkUrl || !invoice.paymentReference) {
      try {
        const total = parseFloat(invoice.total ?? '0')
        const amountCents = Math.round(total * 100)

        const yocoRes = await fetch('https://payments.yoco.com/api/checkouts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${yocoKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: amountCents,
            currency: 'ZAR',
            successUrl: `${publicUrl}&payment=success`,
            cancelUrl: `${publicUrl}&payment=cancelled`,
            failureUrl: `${publicUrl}&payment=failed`,
            metadata: { invoice_id: id, invoice_number: invoice.invoiceNumber },
          }),
        })

        if (yocoRes.ok) {
          const yocoData = (await yocoRes.json()) as { id: string; redirectUrl: string }
          await db
            .update(invoices)
            .set({ paymentReference: yocoData.id, paymentLinkUrl: yocoData.redirectUrl })
            .where(eq(invoices.id, id))
          updated.paymentReference = yocoData.id
          updated.paymentLinkUrl = yocoData.redirectUrl
        } else {
          const errText = await yocoRes.text()
          console.error({ msg: 'Yoco checkout creation failed', invoiceId: id, status: yocoRes.status, body: errText })
        }
      } catch (err) {
        console.error({ msg: 'Yoco checkout creation error', invoiceId: id, err })
        // Non-fatal — continue without payment link
      }
    } else {
      // Reuse existing checkout — no Yoco call needed.
      updated.paymentLinkUrl = invoice.paymentLinkUrl
      updated.paymentReference = invoice.paymentReference
    }
  } else {
    console.log('Yoco not configured — skipping payment link creation')
  }

  let whatsapp_url: string | undefined

  if ((body.via === 'whatsapp' || body.via === 'both') && invoice.clientId) {
    const [client] = await db
      .select({ name: clients.name, phoneWhatsapp: clients.phoneWhatsapp })
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1)

    if (client) {
      const [owner] = await db
        .select({ businessName: users.businessName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      // wa.me requires the phone number without the + prefix
      const phone = client.phoneWhatsapp.replace('+', '')
      const invoiceType = invoice.type === 'quote' ? 'quote' : 'invoice'
      const businessName = owner?.businessName || 'us'
      const totalFormatted = formatZAR(parseFloat(invoice.total ?? '0'))
      const payLink = updated.paymentLinkUrl ? ` Pay here: ${updated.paymentLinkUrl}` : ` View here: ${publicUrl}`
      const message = `Hi ${client.name}, here's your ${invoiceType} from ${businessName} for ${totalFormatted}.${payLink}`
      whatsapp_url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    }
  }

  const sentItems = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(lineItems.sortOrder)

  const payload: SendInvoiceResponse = {
    invoice: {
      ...numericInvoice(updated),
      lineItems: sentItems.map(numericLineItem),
    },
    ...(whatsapp_url ? { whatsapp_url } : {}),
    public_url: publicUrl,
  }
  res.json(payload)
})

// ─── POST /api/invoices/:id/revoke-public-link ───────────────────────────────

router.post('/:id/revoke-public-link', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!existing) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  await db
    .update(invoices)
    .set({ publicToken: null, publicTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(invoices.id, id))

  res.json({ revoked: true })
})

// ─── POST /api/invoices/:id/refresh-public-link ──────────────────────────────

router.post('/:id/refresh-public-link', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!existing) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const token = crypto.randomBytes(20).toString('hex')
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)

  await db
    .update(invoices)
    .set({ publicToken: token, publicTokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(invoices.id, id))

  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'
  res.json({ token, publicUrl: `${clientUrl}/invoice/${id}?t=${token}` })
})

// ─── POST /api/invoices/:id/convert ──────────────────────────────────────────

router.post('/:id/convert', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [quote] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!quote) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  if (quote.type !== 'quote') {
    res.status(400).json({ error: 'Only quotes can be converted to invoices' })
    return
  }

  if (quote.convertedToInvoiceId) {
    res.status(400).json({ error: 'This quote has already been converted', code: 'ALREADY_CONVERTED' })
    return
  }

  try {
    const newInvoice = await db.transaction(async (tx) => {
      const credit = await consumeInvoiceCredit(tx, userId)
      if (!credit.ok) throw new InvoiceLimitReachedError()

      const invoiceNumber = await generateInvoiceNumber(tx, userId, 'invoice')

      const [created] = await tx
        .insert(invoices)
        .values({
          userId: quote.userId,
          clientId: quote.clientId,
          invoiceNumber,
          type: 'invoice',
          status: 'draft',
          subtotal: quote.subtotal,
          vatRate: quote.vatRate,
          vatAmount: quote.vatAmount,
          total: quote.total,
          currency: quote.currency,
          dueDate: quote.dueDate,
          notes: quote.notes,
          sentVia: null,
          sentAt: null,
          viewedAt: null,
          paidAt: null,
          paymentLinkUrl: null,
          paymentReference: null,
        })
        .returning()

      const originalItems = await tx
        .select()
        .from(lineItems)
        .where(eq(lineItems.invoiceId, id))
        .orderBy(lineItems.sortOrder)

      if (originalItems.length > 0) {
        await tx.insert(lineItems).values(
          originalItems.map((item) => ({
            invoiceId: created.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            sortOrder: item.sortOrder,
          })),
        )
      }

      await tx
        .update(invoices)
        .set({ convertedToInvoiceId: created.id, updatedAt: new Date() })
        .where(eq(invoices.id, id))

      return created
    })

    const items = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, newInvoice.id))
      .orderBy(lineItems.sortOrder)

    const payload: InvoiceResponse = {
      ...numericInvoice(newInvoice),
      lineItems: items.map(numericLineItem),
    }
    res.status(201).json(payload)
  } catch (err) {
    if (err instanceof InvoiceLimitReachedError) {
      res.status(403).json({
        error: 'Free plan limited to 10 invoices per month. Upgrade to Premium for unlimited invoicing.',
        code: 'INVOICE_LIMIT_REACHED',
      })
      return
    }
    throw err
  }
})

// ─── POST /api/invoices/:id/mark-paid ────────────────────────────────────────

router.post('/:id/mark-paid', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1)

  if (!existing) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const now = new Date()
  const [updated] = await db
    .update(invoices)
    .set({ status: 'paid', paidAt: now, updatedAt: now })
    .where(eq(invoices.id, id))
    .returning()

  res.json(numericInvoice(updated))
})

export default router
