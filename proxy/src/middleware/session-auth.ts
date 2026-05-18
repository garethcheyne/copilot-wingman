import type { Request, Response, NextFunction } from 'express';
import { lookupSessionByRawToken } from '../services/sessions.js';

/**
 * Validate user session token on admin routes.
 * Expects `x-session-token` header with a valid, non-expired session token.
 * Attaches `req.user` on success.
 *
 * The raw token from the client is SHA-256 hashed before the DB lookup so
 * leaked DB rows can't be replayed.
 */
export async function sessionAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers['x-session-token'] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized — session token required' });
    return;
  }

  try {
    const user = await lookupSessionByRawToken(token);

    if (!user) {
      res.status(401).json({ error: 'Unauthorized — invalid or expired session' });
      return;
    }

    (req as any).user = user;
    next();
  } catch (err) {
    console.error('[auth] session validation error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
