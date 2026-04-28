import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  email: string
  plan: string
}

export interface AuthRequest extends Request {
  user?: JwtPayload
  userId?: string // backward compat for existing routes
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = authHeader.slice(7)
  const secret = process.env.JWT_SECRET!

  try {
    const payload = jwt.verify(token, secret) as JwtPayload
    req.user = { sub: payload.sub, email: payload.email, plan: payload.plan }
    req.userId = payload.sub // backward compat
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}
