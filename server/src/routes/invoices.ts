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
  sql,
  count,
  getTableColumns,
} from 'drizzle-orm'
import { z } from 'zod'
import { generateInvoiceNumber } from '../utils/invoiceNumber'
import { formatZAR } from '../utils/formatZAR'
import { generateInvoicePDF, PdfInvoiceData } from '../services/pdf'

const router = Router()

const FREE_INVOICE_LIMIT = 10

// ─── Schemas ──────────────────────────────────────────────────────────────────

const LineItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().nonnegative('Unit price must be 0 or greater'),
  sortOrder: z.number().int().nonnegative().default(0),
})

const InvoiceBodySchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(['invoice', 'quote']).default('invoice'),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  vatEnabled: z.boolean(),
  lineItems: z.array(LineItemSchema).min(1, 'At least one line item is required'),
})

const SendSchema = z.object({
  via: z.enum(['whatsapp', 'email', 'both']),
})

type InvoiceBody = z.infer<typeof InvoiceBodySchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  vatEnabled: boolean,
) {
  const lineTotals = items.map((item) =>
    parseFloat((item.quantity * item.unitPrice).toFixed(2)),
  )
  const subtotal = parseFloat(lineTotals.reduce((sum, t) => sum + t, 0).toFixed(2))
  const vatRate = vatEnabled ? 15 : 0
  const vatAmount = vatEnabled ? parseFloat((subtotal * 0.15).toFixed(2)) : 0
  const total = parseFloat((subtotal + vatAmount).toFixed(2))
  return { subtotal, vatRate, vatAmount, total, lineTotals }
}

// Drizzle returns numeric(12,2) columns as strings — parse them to numbers.
function numericInvoice(inv: typeof invoices.$inferSelect) {
  return {
    ...inv,
    subtotal: parseFloat(inv.subtotal ?? '0'),
    vatRate: parseFloat(inv.vatRate ?? '0'),
    vatAmount: parseFloat(inv.vatAmount ?? '0'),
    total: parseFloat(inv.total ?? '0'),
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

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
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

  res.json({
    ...numericInvoice(returnedInvoice),
    lineItems: items.map(numericLineItem),
    business: ownerRows[0] ?? null,
    client: clientRows[0] ?? null,
  })
})

// ─── GET /api/invoices/:id/public/pdf — NO auth ───────────────────────────────

router.get('/:id/public/pdf', async (req: Request, res) => {
  const id = req.params['id'] as string

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)

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

  res.json({
    ...numericInvoice(invoice),
    lineItems: items.map(numericLineItem),
    client: clientRows[0] ?? null,
    business: ownerRows[0] ?? null,
  })
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

  // Free tier check
  if (req.user!.plan === 'free') {
    const [user] = await db
      .select({
        invoiceCountThisMonth: users.invoiceCountThisMonth,
        invoiceCountResetAt: users.invoiceCountResetAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const now = new Date()
    const startOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    let currentCount = user?.invoiceCountThisMonth ?? 0

    // Reset counter if it's a new month
    if (!user?.invoiceCountResetAt || user.invoiceCountResetAt < startOfCurrentMonth) {
      await db
        .update(users)
        .set({ invoiceCountThisMonth: 0, invoiceCountResetAt: startOfCurrentMonth })
        .where(eq(users.id, userId))
      currentCount = 0
    }

    if (currentCount >= FREE_INVOICE_LIMIT) {
      res.status(403).json({
        error:
          'Free plan limited to 10 invoices per month. Upgrade to Premium for unlimited invoicing.',
        code: 'INVOICE_LIMIT_REACHED',
      })
      return
    }
  }

  const invoiceNumber = await generateInvoiceNumber(userId, body.type)
  const { subtotal, vatRate, vatAmount, total, lineTotals } = calcTotals(
    body.lineItems,
    body.vatEnabled,
  )

  const result = await db.transaction(async (tx) => {
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

    if (req.user!.plan === 'free') {
      await tx
        .update(users)
        .set({ invoiceCountThisMonth: sql`invoice_count_this_month + 1` })
        .where(eq(users.id, userId))
    }

    return invoice
  })

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, result.id))
    .orderBy(lineItems.sortOrder)

  res.status(201).json({
    ...numericInvoice(result),
    lineItems: items.map(numericLineItem),
  })
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

router.post('/:id/send', validateBody(SendSchema), async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!
  const body = req.body as z.infer<typeof SendSchema>

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

  const now = new Date()
  const [updated] = await db
    .update(invoices)
    .set({ status: 'sent', sentAt: now, sentVia: body.via, updatedAt: now })
    .where(eq(invoices.id, id))
    .returning()

  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'
  const publicUrl = `${clientUrl}/invoice/${id}`

  // ── Yoco checkout creation ───────────────────────────────────────────────────
  const yocoKey = process.env.YOCO_SECRET_KEY
  if (yocoKey && yocoKey.trim() !== '') {
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
          successUrl: `${clientUrl}/invoice/${id}?payment=success`,
          cancelUrl: `${clientUrl}/invoice/${id}?payment=cancelled`,
          failureUrl: `${clientUrl}/invoice/${id}?payment=failed`,
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
        console.error(`Yoco checkout creation failed (${yocoRes.status}): ${errText}`)
      }
    } catch (err) {
      console.error('Yoco checkout creation error:', err)
      // Non-fatal — continue without payment link
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

  res.json({
    invoice: numericInvoice(updated),
    ...(whatsapp_url ? { whatsapp_url } : {}),
    public_url: publicUrl,
  })
})

// ─── POST /api/invoices/:id/convert ──────────────────────────────────────────

router.post('/:id/convert', async (req: AuthRequest, res) => {
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

  if (invoice.type !== 'quote') {
    res.status(400).json({ error: 'Only quotes can be converted to invoices' })
    return
  }

  const invoiceNumber = await generateInvoiceNumber(userId, 'invoice')

  const [updated] = await db
    .update(invoices)
    .set({ type: 'invoice', status: 'draft', invoiceNumber, updatedAt: new Date() })
    .where(eq(invoices.id, id))
    .returning()

  res.json(numericInvoice(updated))
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
