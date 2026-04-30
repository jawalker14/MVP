import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { apiError } from '../utils/errors'
import { db } from '../db'
import { invoices, webhookEvents } from '../db/schema'
import { eq } from 'drizzle-orm'

const router = Router()

// ─── POST /api/webhooks/yoco ──────────────────────────────────────────────────
// Verification flow:
//   1. Reject if any required signing headers are absent.
//   2. Reject if the webhook-timestamp is older than 5 minutes (replay guard).
//   3. Compute HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw-body}"
//      using the decoded key bytes from YOCO_WEBHOOK_SECRET (format: "whsec_<base64>").
//   4. Compare against every "v1,<base64>" token in webhook-signature via
//      timingSafeEqual; reject 401 if none match.
//   5. Idempotency: INSERT ON CONFLICT DO NOTHING — skip re-processing duplicates.
//   6. Parse body and handle the event.

router.post('/yoco', async (req: Request, res: Response) => {
  // ── 1. Require signing headers ────────────────────────────────────────────
  const webhookId = req.headers['webhook-id'] as string | undefined
  const timestamp = req.headers['webhook-timestamp'] as string | undefined
  const sigHeader = req.headers['webhook-signature'] as string | undefined

  if (!webhookId || !timestamp || !sigHeader) {
    apiError(res, 400, 'Missing webhook signing headers', 'MISSING_HEADERS')
    return
  }

  // ── 2. Replay prevention (5-minute window) ────────────────────────────────
  const tsMs = parseInt(timestamp, 10) * 1000
  if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    apiError(res, 400, 'Webhook timestamp out of acceptable range', 'TIMESTAMP_OUT_OF_RANGE')
    return
  }

  // ── 3. Compute expected signature ─────────────────────────────────────────
  // Yoco secrets are formatted as "whsec_<base64>"; the actual key material is
  // the decoded bytes. We strip the prefix before decoding.
  const rawSecret = process.env.YOCO_WEBHOOK_SECRET ?? ''
  const b64Key = rawSecret.startsWith('whsec_') ? rawSecret.slice(6) : rawSecret
  const secretBytes = Buffer.from(b64Key, 'base64')

  const rawBody = req.body as Buffer
  const signedPayload = `${webhookId}.${timestamp}.${rawBody.toString()}`
  const expectedBytes = crypto
    .createHmac('sha256', secretBytes)
    .update(signedPayload)
    .digest()

  // ── 4. Verify against provided signatures ────────────────────────────────
  // Header format: space-separated "v1,<base64sig>" tokens (supports key rotation)
  const providedSigs = sigHeader
    .split(' ')
    .map((token) => token.split(',').slice(1).join(',')) // everything after the first comma
    .filter(Boolean)

  const expectedLen = expectedBytes.length
  const verified = providedSigs.some((b64Sig) => {
    const sigBytes = Buffer.from(b64Sig, 'base64')
    if (sigBytes.length !== expectedLen) return false
    return crypto.timingSafeEqual(expectedBytes, sigBytes)
  })

  if (!verified) {
    apiError(res, 401, 'Invalid webhook signature', 'INVALID_SIGNATURE')
    return
  }

  // ── 5. Idempotency check ──────────────────────────────────────────────────
  const result = await db
    .insert(webhookEvents)
    .values({ id: webhookId })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id })

  if (result.length === 0) {
    // Already processed — acknowledge without re-running business logic
    res.sendStatus(200)
    return
  }

  // ── 6. Process event ──────────────────────────────────────────────────────
  try {
    const body = JSON.parse(rawBody.toString())
    console.log(`Yoco webhook received: type=${body.type} id=${webhookId}`)

    if (body.type === 'payment.succeeded') {
      const invoiceId: string | undefined = body.payload?.metadata?.invoice_id
      const paymentRef: string | undefined = body.payload?.id

      let invoice: typeof invoices.$inferSelect | undefined

      if (invoiceId) {
        const [found] = await db
          .select()
          .from(invoices)
          .where(eq(invoices.id, invoiceId))
          .limit(1)
        invoice = found
      }

      if (!invoice && paymentRef) {
        const [found] = await db
          .select()
          .from(invoices)
          .where(eq(invoices.paymentReference, paymentRef))
          .limit(1)
        invoice = found
      }

      if (invoice && invoice.status !== 'paid') {
        await db
          .update(invoices)
          .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
          .where(eq(invoices.id, invoice.id))
        console.log(`Yoco webhook: marked invoice ${invoice.id} as paid`)
      }
    }
  } catch (err) {
    console.error('Yoco webhook processing error:', err)
  }

  // Always return 200 — prevent Yoco from retrying
  res.sendStatus(200)
})

export default router
