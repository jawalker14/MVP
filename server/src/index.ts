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

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173'
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
        imgSrc: ["'self'", 'data:', 'blob:'],
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
    origin: CLIENT_URL,
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

// ─── Static files ─────────────────────────────────────────────────────────────

// Serve uploaded logos (stored in server/uploads/)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

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
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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