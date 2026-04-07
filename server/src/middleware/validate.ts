import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        details: formatZodError(result.error),
      })
      return
    }
    req.body = result.data
    next()
  }
}

function formatZodError(err: ZodError) {
  return err.errors.map((e) => ({
    path: e.path.join('.'),
    message: e.message,
  }))
}
