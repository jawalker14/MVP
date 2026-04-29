import { db } from '../db'
import { invoices } from '../db/schema'
import { eq, and, inArray, isNotNull, sql } from 'drizzle-orm'

/** Compute "today" in Africa/Johannesburg as YYYY-MM-DD. */
function todayInSAST(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(new Date())
}

export async function flagOverdueForUser(userId: string): Promise<number> {
  const today = todayInSAST()
  const result = await db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(and(
      eq(invoices.userId, userId),
      inArray(invoices.status, ['sent', 'viewed']),
      isNotNull(invoices.dueDate),
      sql`${invoices.dueDate} < ${today}::date`,
    ))
    .returning({ id: invoices.id })
  return result.length
}

export async function flagOverdueForAll(): Promise<number> {
  const today = todayInSAST()
  const result = await db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(and(
      inArray(invoices.status, ['sent', 'viewed']),
      isNotNull(invoices.dueDate),
      sql`${invoices.dueDate} < ${today}::date`,
    ))
    .returning({ id: invoices.id })
  return result.length
}