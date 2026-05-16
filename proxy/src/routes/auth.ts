import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../db/client.js';

export const authRouter = Router();

const SESSION_DURATION_DAYS = 30;

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
      const result = await pool.query(
        `SELECT u.id, u.username, u.display_name, u.role
         FROM user_sessions s JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [token]
      );
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
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

    // Auto-login after setup
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [result.rows[0].id, token, expiresAt]
    );

    res.json({ user: result.rows[0], token });
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

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );

    res.json({
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
      token,
    });
  } catch (err) {
    console.error('[auth] login error:', err);
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
    if (token) {
      await pool.query('DELETE FROM user_sessions WHERE token = $1', [token]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] logout error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
