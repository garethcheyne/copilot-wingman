import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/client.js';
import {
  createSession,
  lookupSessionByRawToken,
  deleteSessionByRawToken,
  hashToken,
} from '../services/sessions.js';

export const authRouter = Router();

/**
 * GET /api/auth/status
 * Check if any users exist (for setup detection) and validate current session.
 */
authRouter.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const needsSetup = userCount.rows[0].count === 0;

    // Check if caller has a valid session
    const token = req.headers['x-session-token'] as string | undefined;
    let user = null;

    if (token) {
      user = await lookupSessionByRawToken(token);
    }

    res.json({ needsSetup, user });
  } catch (err) {
    console.error('[auth] status error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/auth/setup
 * Create the first admin user. Only works when no users exist.
 */
authRouter.post('/setup', async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    if (userCount.rows[0].count > 0) {
      res.status(403).json({ error: 'Setup already completed' });
      return;
    }

    const { username, password, displayName } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'admin') RETURNING id, username, display_name, role`,
      [username.trim(), passwordHash, displayName?.trim() || username.trim()]
    );

    // Auto-login after setup — only the hash is stored; client gets the raw token.
    const { rawToken } = await createSession(result.rows[0].id);

    res.json({ user: result.rows[0], token: rawToken });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    console.error('[auth] setup error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate with username + password, return session token.
 */
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, username, display_name, role, password_hash FROM users WHERE username = $1`,
      [username.trim()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const { rawToken } = await createSession(user.id);

    res.json({
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
      token: rawToken,
    });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/auth/change-password
 * Change the current user's password. Requires valid session + current password.
 */
authRouter.post('/change-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers['x-session-token'] as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const sessionUser = await lookupSessionByRawToken(token);
    if (!sessionUser) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const pwRow = await pool.query('SELECT password_hash FROM users WHERE id = $1', [sessionUser.id]);
    if (pwRow.rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, pwRow.rows[0].password_hash);
    if (!valid) {
      res.status(403).json({ error: 'Current password is incorrect' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, sessionUser.id]);

    // Invalidate every existing session for this user except the current one —
    // a password change should log everyone else out.
    await pool.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND token <> $2',
      [sessionUser.id, hashToken(token)],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] change-password error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate the current session token.
 */
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers['x-session-token'] as string | undefined;
    await deleteSessionByRawToken(token ?? '');
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] logout error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
