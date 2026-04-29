import { Router } from 'express'
import { db } from '../db'
import { invoices, clients } from '../db/schema'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { eq, and, inArray, isNotNull, sql, count } from 'drizzle-orm'
import type { DashboardStats } from '@invoicekasi/shared'

const router = Router()
router.use(requireAuth)

// GET /api/dashboard/summary
router.get('/summary', async (req: AuthRequest, res) => {
  const userId = req.userId!
  const now = new Date()
  // YYYY-MM-DD string for date column comparison (dueDate is stored as date type)
  const today = now.toISOString().split('T')[0] as string
  // ISO string so postgres-js can encode it as a timestamptz parameter in raw sql templates
  const startOfMonthStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  // Overdue detection: flip sent/viewed invoices with a past due_date to overdue
  await db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: now })
    .where(
      and(
        eq(invoices.userId, userId),
        inArray(invoices.status, ['sent', 'viewed']),
        isNotNull(invoices.dueDate),
        sql`${invoices.dueDate} < ${today}::date`,
      ),
    )

  // Aggregate summary + client count in parallel
  const [summaryRows, clientCountRows] = await Promise.all([
    db
      .select({
        totalOutstanding: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status} IN ('sent', 'viewed', 'overdue') THEN ${invoices.total}::numeric ELSE 0 END), 0)`,
        paidThisMonth: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' AND ${invoices.paidAt} >= ${startOfMonthStr}::timestamptz THEN ${invoices.total}::numeric ELSE 0 END), 0)`,
        overdueCount: sql<string>`COUNT(CASE WHEN ${invoices.status} = 'overdue' THEN 1 END)`,
      })
      .from(invoices)
      .where(eq(invoices.userId, userId)),
    db
      .select({ count: count() })
      .from(clients)
      .where(and(eq(clients.userId, userId), eq(clients.isDeleted, false))),
  ])

  const s = summaryRows[0]

  const payload: DashboardStats = {
    total_outstanding: parseFloat(s?.totalOutstanding ?? '0'),
    paid_this_month: parseFloat(s?.paidThisMonth ?? '0'),
    overdue_count: parseInt(s?.overdueCount ?? '0', 10),
    total_clients: Number(clientCountRows[0]?.count ?? 0),
  }
  res.json(payload)
})

export default router
