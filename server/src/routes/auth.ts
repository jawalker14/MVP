import { Router, Response, NextFunction } from 'express'
import { apiError } from '../utils/errors'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer, { MulterError } from 'multer'
import { Resend } from 'resend'
import { db } from '../db'
import { users, magicLinks, refreshTokens } from '../db/schema'
import { validateBody } from '../middleware/validate'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { eq, and, gt, gte, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { uploadLogo, deleteLogo } from '../services/storage'
import {
  RequestMagicLinkSchema,
  VerifyMagicLinkSchema,
  RefreshTokenSchema,
} from '@invoicekasi/shared'
import type { UserResponse, AuthResponse } from '@invoicekasi/shared'

const router = Router()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeUser(u: typeof users.$inferSelect): UserResponse {
  return {
    id: u.id,
    email: u.email,
    businessName: u.businessName || null,
    phone: u.phone || null,
    vatNumber: u.vatNumber ?? null,
    logoUrl: u.logoUrl ?? null,
    addressLine1: u.addressLine1 ?? null,
    addressLine2: u.addressLine2 ?? null,
    city: u.city ?? null,
    province: u.province ?? null,
    postalCode: u.postalCode ?? null,
    bankName: u.bankName ?? null,
    bankAccountNumber: u.bankAccountNumber ?? null,
    bankBranchCode: u.bankBranchCode ?? null,
    languagePref: u.languagePref ?? null,
    plan: u.plan ?? null,
    invoiceCountThisMonth: u.invoiceCountThisMonth ?? null,
    createdAt: u.createdAt?.toISOString() ?? null,
    updatedAt: u.updatedAt?.toISOString() ?? null,
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CompleteOnboardingSchema = z.object({
  business_name: z.string().min(1),
  phone: z.string().min(10),
})

// RefreshTokenSchema from shared; alias locally to keep handler code unchanged
const RefreshSchema = RefreshTokenSchema

const LogoutSchema = z.object({
  refreshToken: z.string().min(1),
})

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000 // 15 minutes
const MAGIC_LINK_RATE_LIMIT = 3 // per email per 15 min window

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, process.env.JWT_SECRET!, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: 'invoicekasi',
    audience: 'invoicekasi-app',
  })
}

async function issueRefreshToken(userId: string): Promise<string> {
  const tokenId = crypto.randomUUID()
  const secret = crypto.randomBytes(40).toString('hex')
  const hash = await bcrypt.hash(secret, 10)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  await db.insert(refreshTokens).values({ userId, tokenId, tokenHash: hash, expiresAt })
  return `${tokenId}.${secret}`
}

// ─── POST /api/auth/request-magic-link ───────────────────────────────────────

router.post(
  '/request-magic-link',
  validateBody(RequestMagicLinkSchema),
  async (req, res) => {
    const { email } = req.body as z.infer<typeof RequestMagicLinkSchema>

    const resendKey = process.env.RESEND_API_KEY
    if (process.env.NODE_ENV === 'production' && !resendKey) {
      console.error('RESEND_API_KEY not configured — cannot send magic link in production')
      apiError(res, 503, 'Email service not configured. Please contact support.', 'SERVICE_UNAVAILABLE')
      return
    }

    // Per-email rate limit: max 3 requests per 15-minute window
    const windowStart = new Date(Date.now() - MAGIC_LINK_TTL_MS)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(magicLinks)
      .where(and(eq(magicLinks.email, email), gte(magicLinks.createdAt, windowStart)))

    let devLink: string | undefined

    if (count < MAGIC_LINK_RATE_LIMIT) {
      const raw = crypto.randomBytes(32).toString('hex')
      const tokenHash = sha256(raw)
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS)

      await db.insert(magicLinks).values({ email, tokenHash, expiresAt })

      const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'
      const magicLinkUrl = `${clientUrl}/auth/verify?token=${raw}&email=${encodeURIComponent(email)}`

      // Always log as a fallback
      console.log(`\n🔗 MAGIC LINK for ${email}:\n${magicLinkUrl}\n`)

      // Send real email via Resend if API key is configured
      if (resendKey) {
        try {
          const resend = new Resend(resendKey)
          await resend.emails.send({
            from: 'InvoiceKasi <hello@invoicekasi.co.za>',
            to: email,
            subject: 'Your InvoiceKasi login link',
            html: `
              <h2>Sign in to InvoiceKasi</h2>
              <p>Click the button below to sign in. This link expires in 15 minutes.</p>
              <a href="${magicLinkUrl}" style="background:#e8b931;color:#0c0f1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Sign In to InvoiceKasi</a>
              <p style="color:#94a3b8;font-size:12px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
            `,
          })
        } catch (err) {
          console.error('Resend email failed:', err)
          // Don't block the user — fall through to 200 response
        }
      }

      if (process.env.NODE_ENV === 'development') {
        devLink = magicLinkUrl
      }
    }

    // Always 200 — never reveal whether email exists or rate limit hit
    res.json({
      message: 'Magic link sent',
      ...(devLink ? { dev_link: devLink } : {}),
    })
  },
)

// ─── POST /api/auth/verify-magic-link ────────────────────────────────────────

router.post(
  '/verify-magic-link',
  validateBody(VerifyMagicLinkSchema),
  async (req, res) => {
    const { email, token } = req.body as z.infer<typeof VerifyMagicLinkSchema>

    const tokenHash = sha256(token)
    const now = new Date()

    // SHA-256 lets us query directly by email + hash — no iteration needed
    const [link] = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.email, email),
          eq(magicLinks.tokenHash, tokenHash),
          gt(magicLinks.expiresAt, now),
          isNull(magicLinks.usedAt),
        ),
      )
      .limit(1)

    if (!link) {
      apiError(res, 401, 'Invalid or expired magic link', 'MAGIC_LINK_INVALID')
      return
    }

    // Consume the link
    await db.update(magicLinks).set({ usedAt: now }).where(eq(magicLinks.id, link.id))

    // Find or create user
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)

    let user: typeof users.$inferSelect
    let isNewUser: boolean

    if (existing.length > 0) {
      user = existing[0]
      isNewUser = false
    } else {
      const [inserted] = await db.insert(users).values({ email }).returning()
      user = inserted
      isNewUser = true
    }

    const accessToken = signAccessToken(user.id, user.email)
    const refreshToken = await issueRefreshToken(user.id)

    const authPayload: AuthResponse = {
      accessToken,
      refreshToken,
      isNewUser,
      user: isNewUser ? undefined : serializeUser(user),
    }
    res.json(authPayload)
  },
)

// ─── POST /api/auth/complete-onboarding ──────────────────────────────────────

router.post(
  '/complete-onboarding',
  requireAuth,
  validateBody(CompleteOnboardingSchema),
  async (req: AuthRequest, res) => {
    const { business_name, phone } = req.body as z.infer<typeof CompleteOnboardingSchema>

    const [updated] = await db
      .update(users)
      .set({ businessName: business_name, phone, updatedAt: new Date() })
      .where(eq(users.id, req.user!.sub))
      .returning()

    if (!updated) {
      apiError(res, 404, 'User not found', 'USER_NOT_FOUND')
      return
    }

    res.json({
      id: updated.id,
      email: updated.email,
      businessName: updated.businessName,
      phone: updated.phone,
      plan: updated.plan,
    })
  },
)

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

router.post('/refresh', validateBody(RefreshSchema), async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof RefreshSchema>

  const dot = refreshToken.indexOf('.')
  const tokenId = dot !== -1 ? refreshToken.slice(0, dot) : ''
  const secret = dot !== -1 ? refreshToken.slice(dot + 1) : ''

  if (!tokenId || !secret) {
    apiError(res, 401, 'Invalid or expired refresh token', 'REFRESH_TOKEN_INVALID')
    return
  }

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenId, tokenId), gt(refreshTokens.expiresAt, new Date())))
    .limit(1)

  if (!row || !(await bcrypt.compare(secret, row.tokenHash))) {
    apiError(res, 401, 'Invalid or expired refresh token', 'REFRESH_TOKEN_INVALID')
    return
  }

  // Token rotation: delete old before issuing new
  await db.delete(refreshTokens).where(eq(refreshTokens.id, row.id))

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1)
  if (!user) {
    apiError(res, 401, 'Invalid or expired refresh token', 'REFRESH_TOKEN_INVALID')
    return
  }

  const accessToken = signAccessToken(user.id, user.email)
  const newRefreshToken = await issueRefreshToken(user.id)

  res.json({ accessToken, refreshToken: newRefreshToken })
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', requireAuth, validateBody(LogoutSchema), async (req: AuthRequest, res) => {
  const { refreshToken } = req.body as z.infer<typeof LogoutSchema>

  const dot = refreshToken.indexOf('.')
  const tokenId = dot !== -1 ? refreshToken.slice(0, dot) : ''

  if (tokenId) {
    await db
      .delete(refreshTokens)
      .where(and(eq(refreshTokens.tokenId, tokenId), eq(refreshTokens.userId, req.user!.sub)))
  }

  res.json({ message: 'Logged out' })
})

// ─── PUT /api/auth/profile ────────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  business_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  vat_number: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  address_line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account_number: z.string().nullable().optional(),
  bank_branch_code: z.string().nullable().optional(),
  language_pref: z.string().optional(),
})

router.put(
  '/profile',
  requireAuth,
  validateBody(UpdateProfileSchema),
  async (req: AuthRequest, res) => {
    const body = req.body as z.infer<typeof UpdateProfileSchema>

    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (body.business_name !== undefined) patch.businessName = body.business_name
    if (body.phone !== undefined) patch.phone = body.phone
    if (body.vat_number !== undefined) patch.vatNumber = body.vat_number
    if (body.address_line1 !== undefined) patch.addressLine1 = body.address_line1
    if (body.address_line2 !== undefined) patch.addressLine2 = body.address_line2
    if (body.city !== undefined) patch.city = body.city
    if (body.province !== undefined) patch.province = body.province
    if (body.postal_code !== undefined) patch.postalCode = body.postal_code
    if (body.bank_name !== undefined) patch.bankName = body.bank_name
    if (body.bank_account_number !== undefined) patch.bankAccountNumber = body.bank_account_number
    if (body.bank_branch_code !== undefined) patch.bankBranchCode = body.bank_branch_code
    if (body.language_pref !== undefined) patch.languagePref = body.language_pref

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, req.user!.sub))
      .returning()

    if (!updated) {
      apiError(res, 404, 'User not found', 'USER_NOT_FOUND')
      return
    }

    res.json({
      id: updated.id,
      email: updated.email,
      businessName: updated.businessName,
      phone: updated.phone,
      vatNumber: updated.vatNumber,
      logoUrl: updated.logoUrl,
      addressLine1: updated.addressLine1,
      addressLine2: updated.addressLine2,
      city: updated.city,
      province: updated.province,
      postalCode: updated.postalCode,
      bankName: updated.bankName,
      bankAccountNumber: updated.bankAccountNumber,
      bankBranchCode: updated.bankBranchCode,
      languagePref: updated.languagePref,
      plan: updated.plan,
      invoiceCountThisMonth: updated.invoiceCountThisMonth,
    })
  },
)

// ─── POST /api/auth/logo ──────────────────────────────────────────────────────

const MAGIC_BYTES: Record<string, Buffer> = {
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
}

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
      cb(null, true)
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'))
    }
  },
})

function logoUploadMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  logoUpload.single('logo')(req as any, res, (err: any) => {
    if (err) {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          apiError(res, 413, 'File too large (max 2MB)', 'FILE_TOO_LARGE')
          return
        }
        apiError(res, 400, err.message, err.code)
        return
      }
      // fileFilter rejection or other
      apiError(res, 400, err.message ?? 'Upload failed', 'UPLOAD_FAILED')
      return
    }
    next()
  })
}

router.post(
  '/logo',
  requireAuth,
  logoUploadMiddleware,
  async (req: AuthRequest, res) => {
    if (!req.file) {
      apiError(res, 400, 'No file uploaded', 'NO_FILE')
      return
    }

    const expected = MAGIC_BYTES[req.file.mimetype]
    if (!expected || !req.file.buffer.subarray(0, expected.length).equals(expected)) {
      apiError(res, 400, 'File content does not match declared image type', 'INVALID_FILE_CONTENT')
      return
    }

    const [existing] = await db.select({ logoUrl: users.logoUrl }).from(users).where(eq(users.id, req.user!.sub)).limit(1)
    const oldUrl = existing?.logoUrl ?? null

    const logoUrl = await uploadLogo(
      req.user!.sub,
      req.file.buffer,
      req.file.mimetype as 'image/png' | 'image/jpeg',
    )

    const [updated] = await db
      .update(users)
      .set({ logoUrl, updatedAt: new Date() })
      .where(eq(users.id, req.user!.sub))
      .returning()

    if (!updated) {
      apiError(res, 404, 'User not found', 'USER_NOT_FOUND')
      return
    }

    if (oldUrl) void deleteLogo(oldUrl)

    res.json({ logo_url: logoUrl })
  },
)

// ─── GET /api/auth/config ─────────────────────────────────────────────────────

router.get('/config', (_req, res) => {
  res.json({
    emailEnabled: Boolean(process.env.RESEND_API_KEY),
    yocoEnabled: Boolean(process.env.YOCO_SECRET_KEY),
  })
})

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.sub)).limit(1)

  if (!user) {
    apiError(res, 404, 'User not found', 'USER_NOT_FOUND')
    return
  }

  const mePayload: UserResponse = serializeUser(user)
  res.json(mePayload)
})

export default router
