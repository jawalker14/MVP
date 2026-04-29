import { invoices } from '../db/schema'
import { eq, and, like, sql } from 'drizzle-orm'

/**
 * Generate the next invoice number for a user inside an active transaction.
 * Acquires a per-(user, type) advisory lock for the duration of the tx so
 * concurrent calls for the same user serialize rather than racing on MAX.
 * Format: INV-001 … INV-999, INV-1000 (3-digit minimum padding). QUO- for quotes.
 */
export async function generateInvoiceNumber(
  tx: any,
  userId: string,
  type: 'invoice' | 'quote',
): Promise<string> {
  const prefix = type === 'quote' ? 'QUO' : 'INV'

  // Serialize all numbering ops for the same (user, type) pair.
  // hashtext() maps the combined key to a bigint; xact_lock auto-releases on commit/rollback.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${userId}::text || ${type}::text))`,
  )

  const last = await tx
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), like(invoices.invoiceNumber, `${prefix}-%`)))
    .orderBy(sql`CAST(SPLIT_PART(invoice_number, '-', 2) AS INTEGER) DESC`)
    .limit(1)

  let nextNum = 1
  if (last.length > 0) {
    const lastNum = parseInt(last[0].invoiceNumber.split('-')[1] ?? '0', 10)
    nextNum = lastNum + 1
  }

  return `${prefix}-${String(nextNum).padStart(3, '0')}`
}