import { db } from '../db'
import { invoices } from '../db/schema'
import { eq, and, inArray, isNotNull, sql } from 'drizzle-orm'
import { todayInSAST } from '../utils/dates'

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