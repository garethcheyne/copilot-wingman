import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/client.js';

/**
 * Validate user session token on admin routes.
 * Expects `x-session-token` header with a valid, non-expired session token.
 * Attaches `req.user` on success.
 */
export async function sessionAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers['x-session-token'] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized — session token required' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role
       FROM user_sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized — invalid or expired session' });
      return;
    }

    // Attach user to request for downstream handlers
    (req as any).user = result.rows[0];
    next();
  } catch (err) {
    console.error('[auth] session validation error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
