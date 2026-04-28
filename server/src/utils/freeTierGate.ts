import { eq } from 'drizzle-orm'
import { users } from '../db/schema'

const FREE_INVOICE_LIMIT = 10

export type CreditResult = { ok: true } | { ok: false; reason: 'limit_reached' }

export class InvoiceLimitReachedError extends Error {
  status = 403
  code = 'INVOICE_LIMIT_REACHED'
  constructor() {
    super('Invoice limit reached')
    this.name = 'InvoiceLimitReachedError'
  }
}

export async function consumeInvoiceCredit(tx: any, userId: string): Promise<CreditResult> {
  const [user] = await tx
    .select({
      plan: users.plan,
      invoiceCountThisMonth: users.invoiceCountThisMonth,
      invoiceCountResetAt: users.invoiceCountResetAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update')
    .limit(1)

  if (!user) return { ok: false, reason: 'limit_reached' }
  if (user.plan !== 'free') return { ok: true }

  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  let count = user.invoiceCountThisMonth ?? 0
  let resetAt = user.invoiceCountResetAt

  if (!resetAt || resetAt < startOfMonth) {
    count = 0
    resetAt = startOfMonth
  }

  if (count >= FREE_INVOICE_LIMIT) {
    return { ok: false, reason: 'limit_reached' }
  }

  await tx
    .update(users)
    .set({ invoiceCountThisMonth: count + 1, invoiceCountResetAt: resetAt })
    .where(eq(users.id, userId))

  return { ok: true }
}