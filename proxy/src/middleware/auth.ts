import type { Request, Response, NextFunction } from 'express';

/**
 * Validate INTERNAL_API_KEY on all requests from Next.js.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.INTERNAL_API_KEY;

  // If no key configured, skip (dev mode)
  if (!apiKey) {
    next();
    return;
  }

  const provided = req.headers['x-api-key'] as string | undefined;

  if (!provided || provided !== apiKey) {
    res.status(401).json({ error: 'Unauthorized — invalid API key' });
    return;
  }

  next();
}
