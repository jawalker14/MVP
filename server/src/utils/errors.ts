import { Response } from 'express'

export function apiError(
  res: Response,
  status: number,
  error: string,
  code?: string,
  details?: Array<{ path: string; message: string }>,
) {
  const body: Record<string, unknown> = { error }
  if (code !== undefined) body.code = code
  if (details !== undefined) body.details = details
  return res.status(status).json(body)
}