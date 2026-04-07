import { Router, Request, Response } from 'express'
import { db } from '../db'
import { invoices } from '../db/schema'
import { eq } from 'drizzle-orm'

const router = Router()

// ─── POST /api/webhooks/yoco ──────────────────────────────────────────────────
// No auth — webhooks come from Yoco's servers.
// Uses express.raw() body parser (mounted in index.ts) to preserve raw body
// for future signature verification.
//
// TODO: Before going to production, implement Yoco webhook signature verification
// using the webhook-signature header sent by Yoco.

router.post('/yoco', async (req: Request, res: Response) => {
  // Log headers for debugging / future signature verification
  console.log('Yoco webhook headers:', JSON.stringify(req.headers, null, 2))

  try {
    const body = JSON.parse((req.body as Buffer).toString())

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