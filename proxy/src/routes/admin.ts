import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db/client.js';
import { encrypt, decrypt } from '../services/crypto.js';
import { validateConnection, invalidateTokenCache, getCopilotToken, loadGitHubToken } from '../services/copilot-token.js';
import { chatCompletion } from '../services/copilot-client.js';
import { initiateDeviceAuth, pollDeviceAuth } from '../services/github-oauth.js';
import {
  listSessionsWithStats,
  getSessionById,
  getMessages,
  deleteSession,
} from '../services/session-manager.js';
import { getUsageSummary, type UsageWindow } from '../services/usage.js';

export const adminRouter = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';

/**
 * GET /api/admin/connection
 * Returns the current connection status (no token exposed).
 */
adminRouter.get('/connection', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, label, auth_method, status, github_username, copilot_plan,
              token_expires_at, last_validated_at, last_error, created_at, updated_at
       FROM gh_connections
       ORDER BY updated_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      res.json({ connected: false });
      return;
    }

    res.json({ connected: true, connection: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/connection
 * Body: { token } — for programmatic token injection (OAuth tokens only).
 */
adminRouter.post('/connection', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as { token: string };

    if (!token) {
      res.status(400).json({ error: 'token is required' });
      return;
    }

    // Encrypt the token
    const encrypted = encrypt(token, ENCRYPTION_KEY);

    // Deactivate any existing connections
    await pool.query(`UPDATE gh_connections SET status = 'expired' WHERE status = 'active'`);

    // Clear cached tokens so new one is used
    invalidateTokenCache();

    // Insert new connection
    const result = await pool.query(
      `INSERT INTO gh_connections (label, auth_method, encrypted_token, status)
       VALUES ($1, 'oauth', $2, 'active')
       RETURNING id, label, auth_method, status, created_at`,
      ['GitHub Copilot (OAuth)', encrypted]
    );

    // Validate immediately
    const validation = await validateConnection();
    if (validation.ok) {
      await pool.query(
        `UPDATE gh_connections SET github_username = $1, last_validated_at = NOW() WHERE id = $2`,
        [validation.username, result.rows[0].id]
      );
    }

    res.json({
      connection: result.rows[0],
      validation,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/connection/test
 * Test the current connection without modifying anything.
 */
adminRouter.post('/connection/test', async (_req: Request, res: Response): Promise<void> => {
  try {
    const validation = await validateConnection();
    res.json(validation);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/connection/ping
 * Send a real message to Copilot and return the response — proves end-to-end works.
 */
adminRouter.post('/connection/ping', async (_req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const reply = await chatCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Reply in one short sentence.' },
        { role: 'user', content: 'Say hello and confirm you are working.' },
      ],
      model: 'gpt-4o',
      stream: false,
    });
    const latencyMs = Date.now() - startTime;

    res.json({ ok: true, reply, latencyMs });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /api/admin/connection/:id
 */
adminRouter.delete('/connection/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await pool.query(
      `UPDATE gh_connections SET status = 'revoked' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────
// OAuth Device Flow (same flow as VS Code Copilot extension)
// ─────────────────────────────────────────────────

/**
 * POST /api/admin/connection/oauth/start
 * Initiates the GitHub device OAuth flow.
 * Returns: { userCode, verificationUri, deviceCode, expiresIn, interval }
 */
adminRouter.post('/connection/oauth/start', async (_req: Request, res: Response): Promise<void> => {
  try {
    const device = await initiateDeviceAuth();
    res.json({
      userCode: device.user_code,
      verificationUri: device.verification_uri,
      deviceCode: device.device_code,
      expiresIn: device.expires_in,
      interval: device.interval,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/connection/oauth/poll
 * Body: { deviceCode }
 * Polls GitHub to check if the user completed the OAuth flow.
 * Returns: { status: 'pending' | 'success' | 'expired' | 'error', error? }
 * On success, stores the token and validates the connection.
 */
adminRouter.post('/connection/oauth/poll', async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceCode } = req.body as { deviceCode: string };
    if (!deviceCode) {
      res.status(400).json({ error: 'deviceCode is required' });
      return;
    }

    const result = await pollDeviceAuth(deviceCode);

    if (result.status !== 'success') {
      res.json({ status: result.status, error: result.error, interval: result.interval });
      return;
    }

    // Success — store the OAuth token
    const token = result.access_token!;
    const encrypted = encrypt(token, ENCRYPTION_KEY);

    // Deactivate any existing connections
    await pool.query(`UPDATE gh_connections SET status = 'expired' WHERE status = 'active'`);
    invalidateTokenCache();

    // Insert new connection
    const insertResult = await pool.query(
      `INSERT INTO gh_connections (label, auth_method, encrypted_token, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id, label, auth_method, status, created_at`,
      ['GitHub Copilot (OAuth)', 'oauth', encrypted]
    );

    // Validate immediately
    const validation = await validateConnection();
    if (validation.ok) {
      await pool.query(
        `UPDATE gh_connections SET github_username = $1, last_validated_at = NOW() WHERE id = $2`,
        [validation.username, insertResult.rows[0].id]
      );
    }

    res.json({
      status: 'success',
      connection: insertResult.rows[0],
      validation,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: (err as Error).message });
  }
});

/**
 * GET /api/admin/models
 * Returns available Copilot models.
 */
adminRouter.get('/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    const token = await getCopilotToken();
    const modelsRes = await fetch('https://api.githubcopilot.com/models', {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GithubCopilot/1.300.0',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.100.0',
        'Editor-Plugin-Version': 'copilot-chat/0.28.0',
        Accept: 'application/json',
      },
    });

    if (!modelsRes.ok) {
      res.status(modelsRes.status).json({ error: `Models API returned ${modelsRes.status}` });
      return;
    }

    const data = (await modelsRes.json()) as any;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/account
 * Returns Copilot account info: plan, quotas, features.
 */
adminRouter.get('/account', async (_req: Request, res: Response): Promise<void> => {
  try {
    const githubToken = await loadGitHubToken();

    const [userRes, copilotRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${githubToken}`, 'User-Agent': 'GithubCopilot/1.300.0' },
      }),
      fetch('https://api.github.com/copilot_internal/user', {
        headers: {
          Authorization: `token ${githubToken}`,
          'User-Agent': 'GithubCopilot/1.300.0',
          'Editor-Version': 'vscode/1.100.0',
          'Editor-Plugin-Version': 'copilot-chat/0.28.0',
          Accept: 'application/json',
        },
      }),
    ]);

    const user = userRes.ok ? (await userRes.json()) as any : null;
    const copilot = copilotRes.ok ? (await copilotRes.json()) as any : null;

    res.json({
      user: user ? {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        email: user.email,
      } : null,
      copilot: copilot ? {
        plan: copilot.copilot_plan,
        chat_enabled: copilot.chat_enabled,
        cli_enabled: copilot.cli_enabled,
        mcp_enabled: copilot.is_mcp_enabled,
        quota_reset_date: copilot.quota_reset_date,
        quotas: copilot.quota_snapshots,
        endpoints: copilot.endpoints,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────

/**
 * GET /api/admin/settings
 * Returns all app settings.
 */
adminRouter.get('/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`SELECT key, value FROM app_settings`);
    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * PUT /api/admin/settings/:key
 * Body: { value }
 */
adminRouter.put('/settings/:key', async (req: Request, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const { value } = req.body as { value: string };

    if (!value) {
      res.status(400).json({ error: 'value is required' });
      return;
    }

    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );

    res.json({ ok: true, key, value });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/sessions
 * Returns all sessions with rolled-up message counts and totals.
 */
adminRouter.get('/sessions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await listSessionsWithStats(200);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/sessions/:id
 * Returns one session plus all its messages.
 */
adminRouter.get('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await getSessionById(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const messages = await getMessages(session.id);
    res.json({ session, messages });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * DELETE /api/admin/sessions/:id
 * Drops a session (cascades to its messages).
 */
adminRouter.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await deleteSession(String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/usage?window=24h|7d|30d
 * Returns aggregate stats from request_log.
 */
adminRouter.get('/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req.query.window as string | undefined) ?? '24h';
    const window: UsageWindow =
      raw === '7d' || raw === '30d' || raw === '24h' ? raw : '24h';
    const summary = await getUsageSummary(window);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
