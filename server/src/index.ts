import dotenv from 'dotenv'
import path from 'path'
// Load .env from monorepo root (one level up from server/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import fs from 'fs'

import authRouter from './routes/auth'
import clientsRouter from './routes/clients'
import invoicesRouter from './routes/invoices'
import dashboardRouter from './routes/dashboard'
import webhooksRouter from './routes/webhooks'

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'CLIENT_URL', 'R2_PUBLIC_BASE_URL'] as const

function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production'
  let missing = 0

  for (const name of REQUIRED_ENV) {
    if (!process.env[name]) {
      if (isProd) {
        console.error(`❌ MISSING_ENV: ${name}`)
        missing++
      } else {
        console.warn(`⚠️  Missing env: ${name}`)
      }
    }
  }

  // If payments are wired up, the webhook secret must also be set
  if (process.env.YOCO_SECRET_KEY && !process.env.YOCO_WEBHOOK_SECRET) {
    if (isProd) {
      console.error('❌ MISSING_ENV: YOCO_WEBHOOK_SECRET (required when YOCO_SECRET_KEY is set)')
      missing++
    } else {
      console.warn('⚠️  Missing env: YOCO_WEBHOOK_SECRET')
    }
  }

  if (isProd && missing > 0) {
    console.error(`Server refused to start: ${missing} required env var(s) missing`)
    process.exit(1)
  }

  const secret = process.env.JWT_SECRET
  if (isProd && secret !== undefined) {
    if (secret.length < 32) {
      console.error('❌ JWT_SECRET must be at least 32 characters in production')
      process.exit(1)
    }
    if (secret === 'change-me-in-production-min-32-chars') {
      console.error('❌ JWT_SECRET is still the .env.example placeholder — set a real secret')
      process.exit(1)
    }
  }

  console.log(`✓ Env validated (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`)
}

validateEnv()

// ─── R2 public origin (for CSP) ───────────────────────────────────────────────

const r2Origin = (() => {
  try {
    return process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL).origin : null
  } catch {
    return null
  }
})()

// ─── CORS allow-list (computed once at module scope) ─────────────────────────

const corsStaticOrigins = new Set(
  [process.env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000'].filter(Boolean) as string[],
)

const vercelPrefixPattern: RegExp | null = (() => {
  const prefix = process.env.VERCEL_PROJECT_PREFIX
  if (!prefix) return null
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Matches: {prefix}.vercel.app  AND  {prefix}-<branch-or-hash>.vercel.app
  return new RegExp(
    `^https://${esc}(-[a-z0-9-]+)?-[a-z0-9-]+\\.vercel\\.app$|^https://${esc}\\.vercel\\.app$`,
  )
})()

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)
const IS_PROD = process.env.NODE_ENV === 'production'

// ─── Trust proxy (Render/Railway sit behind a load balancer) ─────────────────

app.set('trust proxy', 1)

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', ...(r2Origin ? [r2Origin] : [])],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", 'https://payments.yoco.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: IS_PROD ? [] : null,
      },
    },
  }),
)

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed =
        !origin ||
        corsStaticOrigins.has(origin) ||
        (vercelPrefixPattern !== null && vercelPrefixPattern.test(origin))
      allowed ? callback(null, true) : callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  }),
)

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later' },
})

// ─── Body parsing ─────────────────────────────────────────────────────────────

// Yoco webhook needs raw body — mount BEFORE express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter)

app.use(express.json({ limit: '10mb' }))

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: Date.now() })
})

app.use('/api/auth', authLimiter, authRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/invoices', invoicesRouter)
app.use('/api/dashboard', dashboardRouter)

// ─── Serve client SPA in production ──────────────────────────────────────────

const clientDist = path.join(__dirname, '../../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next()
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.code === '23505') {
    res.status(409).json({ error: 'Conflict', code: 'DUPLICATE' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`InvoiceKasi API running on http://0.0.0.0:${PORT}`)
})

// Graceful shutdown — Railway sends SIGTERM before cycling a container
process.on('SIGTERM', () => {
  console.log('SIGTERM received — closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  process.exit(1)
})

export default app