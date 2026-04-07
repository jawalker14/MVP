import { db } from '../db'
import { invoices } from '../db/schema'
import { eq, and, like, sql } from 'drizzle-orm'

/**
 * Generate the next invoice number for a user.
 * Format: INV-001, INV-002, ..., INV-999, INV-1000 (minimum 3-digit padding)
 * For quotes: QUO-001, QUO-002, etc.
 * Uses numeric ordering to correctly handle numbers beyond 999.
 */
export async function generateInvoiceNumber(
  userId: string,
  type: 'invoice' | 'quote',
): Promise<string> {
  const prefix = type === 'quote' ? 'QUO' : 'INV'

  const last = await db
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
