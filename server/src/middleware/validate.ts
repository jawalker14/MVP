import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { apiError } from '../utils/errors'

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      apiError(res, 400, 'Validation error', 'VALIDATION_FAILED', formatZodError(result.error))
      return
    }
    req.body = result.data
    next()
  }
}

function formatZodError(err: ZodError) {
  return err.issues.map((e) => ({
    path: e.path.join('.'),
    message: e.message,
  }))
}
