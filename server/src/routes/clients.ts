import { Router } from 'express'
import { db } from '../db'
import { clients, users } from '../db/schema'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import { eq, and, ilike, or, count, asc } from 'drizzle-orm'
import { z } from 'zod'
import { normalisePhone } from '../utils/normalisePhone'
import { CreateClientSchema, UpdateClientSchema } from '@invoicekasi/shared'
import type { ClientResponse } from '@invoicekasi/shared'
import type { Client } from '../db/schema'

const router = Router()
router.use(requireAuth)

function serializeClient(c: Client): ClientResponse {
  return {
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    phoneWhatsapp: c.phoneWhatsapp,
    address: c.address ?? null,
    notes: c.notes ?? null,
    createdAt: c.createdAt?.toISOString() ?? null,
    updatedAt: c.updatedAt?.toISOString() ?? null,
  }
}

// GET /api/clients
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId!
  const search = (req.query['search'] as string) || ''
  const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt((req.query['limit'] as string) || '20', 10)))

  const conditions = [
    eq(clients.userId, userId),
    eq(clients.isDeleted, false),
    ...(search
      ? [or(ilike(clients.name, `%${search}%`), ilike(clients.phoneWhatsapp, `%${search}%`))]
      : []),
  ]

  const whereClause = and(...conditions)

  const [countResult, rows] = await Promise.all([
    db.select({ count: count() }).from(clients).where(whereClause),
    db
      .select()
      .from(clients)
      .where(whereClause)
      .orderBy(asc(clients.name))
      .limit(limit)
      .offset((page - 1) * limit),
  ])

  const total = Number(countResult[0]?.count ?? 0)

  res.json({
    clients: rows.map(serializeClient),
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  })
})

// GET /api/clients/:id
router.get('/:id', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.userId, userId), eq(clients.isDeleted, false)))
    .limit(1)

  if (!client) {
    res.status(404).json({ error: 'Client not found' })
    return
  }
  res.json(serializeClient(client))
})

// POST /api/clients
router.post('/', validateBody(CreateClientSchema), async (req: AuthRequest, res) => {
  const userId = req.userId!
  const body = req.body as z.infer<typeof CreateClientSchema>

  // Free tier check: max 5 active clients — read plan fresh from DB, not JWT
  const [u] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1)
  const plan = u?.plan ?? 'free'
  if (plan === 'free') {
    const [{ count: clientCount }] = await db
      .select({ count: count() })
      .from(clients)
      .where(and(eq(clients.userId, userId), eq(clients.isDeleted, false)))

    if (Number(clientCount) >= 5) {
      res.status(403).json({
        error: 'Free plan limited to 5 clients. Upgrade to Premium for unlimited clients.',
        code: 'CLIENT_LIMIT_REACHED',
      })
      return
    }
  }

  const normalisedPhone = normalisePhone(body.phoneWhatsapp)

  // Duplicate phone check
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.userId, userId),
        eq(clients.phoneWhatsapp, normalisedPhone),
        eq(clients.isDeleted, false),
      ),
    )
    .limit(1)

  if (existing) {
    res.status(409).json({ error: 'A client with this WhatsApp number already exists.' })
    return
  }

  const [inserted] = await db
    .insert(clients)
    .values({ ...body, phoneWhatsapp: normalisedPhone, userId })
    .returning()

  res.status(201).json(serializeClient(inserted))
})

// PUT /api/clients/:id
router.put('/:id', validateBody(UpdateClientSchema), async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!
  const body = req.body as z.infer<typeof UpdateClientSchema>

  // Verify ownership
  const [owned] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.userId, userId), eq(clients.isDeleted, false)))
    .limit(1)

  if (!owned) {
    res.status(404).json({ error: 'Client not found' })
    return
  }

  const setValues: Partial<typeof clients.$inferInsert> & { updatedAt: Date } = {
    ...body,
    updatedAt: new Date(),
  }

  if (body.phoneWhatsapp) {
    const normalisedPhone = normalisePhone(body.phoneWhatsapp)
    setValues.phoneWhatsapp = normalisedPhone

    // Duplicate check (exclude self)
    const [dup] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.userId, userId),
          eq(clients.phoneWhatsapp, normalisedPhone),
          eq(clients.isDeleted, false),
        ),
      )
      .limit(1)

    if (dup && dup.id !== id) {
      res.status(409).json({ error: 'A client with this WhatsApp number already exists.' })
      return
    }
  }

  const [updated] = await db
    .update(clients)
    .set(setValues)
    .where(and(eq(clients.id, id), eq(clients.userId, userId)))
    .returning()

  res.json(serializeClient(updated))
})

// DELETE /api/clients/:id — soft delete
router.delete('/:id', async (req: AuthRequest, res) => {
  const id = req.params['id'] as string
  const userId = req.userId!

  const [deleted] = await db
    .update(clients)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.userId, userId), eq(clients.isDeleted, false)))
    .returning({ id: clients.id })

  if (!deleted) {
    res.status(404).json({ error: 'Client not found' })
    return
  }

  res.json({ message: 'Client deleted' })
})

export default router
