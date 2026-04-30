import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { apiError } from '../utils/errors'

export interface JwtPayload {
  sub: string
  email: string
}

export interface AuthRequest extends Request {
  user?: JwtPayload
  userId?: string // backward compat for existing routes
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    apiError(res, 401, 'Unauthorized', 'UNAUTHORIZED')
    return
  }

  const token = authHeader.slice(7)
  const secret = process.env.JWT_SECRET!

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'invoicekasi', audience: 'invoicekasi-app' }) as JwtPayload
    req.user = { sub: payload.sub, email: payload.email }
    req.userId = payload.sub // backward compat
    next()
  } catch {
    apiError(res, 401, 'Unauthorized', 'UNAUTHORIZED')
  }
}
