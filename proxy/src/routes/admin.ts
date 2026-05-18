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
import {
  getActiveModels,
  getSyncEvents,
  getLastSyncTime,
  syncModels,
  validateModelIds,
  getModelById,
} from '../services/model-sync.js';
import { loadLlmStatsKey, getModelDetail as getLlmStatsModelDetail } from '../services/llm-stats.js';

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
 * Returns ALL models from the DB (populated by the sync service).
 * Includes active, removed, and revoked models so the admin can see the full picture.
 */
adminRouter.get('/models', async (_req: Request, res: Response): Promise<void> => {
  try {
    // All models (including removed) for the full admin view
    const allResult = await pool.query(
      `SELECT * FROM upstream_models ORDER BY status, vendor, name`
    );
    const lastSync = await getLastSyncTime();

    const active = allResult.rows.filter(r => r.status === 'active');
    const removed = allResult.rows.filter(r => r.status !== 'active');

    res.json({
      data: active,
      removed,
      total: active.length,
      total_removed: removed.length,
      chat_capable: active.filter(r => r.chat_enabled).length,
      last_sync: lastSync?.toISOString() ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/models/sync
 * Trigger an immediate model sync with upstream.
 */
adminRouter.post('/models/sync', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await syncModels();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/models/events
 * Returns recent model sync events (additions, removals, changes).
 */
adminRouter.get('/models/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const events = await getSyncEvents(limit);
    res.json({ events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/models/validate-scopes
 * Given a list of model IDs, returns which are still active and which are invalid.
 * Useful for the API key editor to warn about stale scopes.
 */
adminRouter.post('/models/validate-scopes', async (req: Request, res: Response): Promise<void> => {
  try {
    const { scopes } = req.body as { scopes: string[] };
    if (!Array.isArray(scopes)) {
      res.status(400).json({ error: 'scopes must be an array of model IDs' });
      return;
    }
    const result = await validateModelIds(scopes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/models/:id
 * Returns a single model from the DB, optionally enriched with LLM Stats data.
 */
adminRouter.get('/models/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const model = await getModelById(id);

    if (!model) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }

    // Try to enrich with LLM Stats data
    let llmStats = null;
    try {
      const apiKey = await loadLlmStatsKey();
      if (apiKey) {
        llmStats = await getLlmStatsModelDetail(apiKey, id);
      }
    } catch {
      // LLM Stats unavailable — return model without enrichment
    }

    // Get sync events for this model
    const eventsResult = await pool.query(
      `SELECT * FROM model_sync_log WHERE model_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    res.json({
      model,
      llm_stats: llmStats,
      events: eventsResult.rows,
    });
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

// Keys in this set are stored encrypted and never returned in plain text
const ENCRYPTED_SETTINGS = new Set(['llm_stats_api_key']);

/**
 * GET /api/admin/settings
 * Returns all app settings. Encrypted keys are returned as masked booleans.
 */
adminRouter.get('/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`SELECT key, value FROM app_settings`);
    const settings: Record<string, string | boolean> = {};
    for (const row of result.rows) {
      if (ENCRYPTED_SETTINGS.has(row.key)) {
        // Don't return the encrypted value — just indicate it's set
        settings[row.key] = true;
      } else {
        settings[row.key] = row.value;
      }
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * PUT /api/admin/settings/:key
 * Body: { value }
 * Encrypted settings are stored with AES-256-GCM.
 */
adminRouter.put('/settings/:key', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = String(req.params.key);
    const { value } = req.body as { value: string };

    if (!value) {
      res.status(400).json({ error: 'value is required' });
      return;
    }

    let storedValue = value;
    if (ENCRYPTED_SETTINGS.has(key)) {
      // Encrypt sensitive values before storing
      const encrypted = encrypt(value, ENCRYPTION_KEY);
      storedValue = encrypted.toString('base64');
    }

    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, storedValue]
    );

    res.json({ ok: true, key });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * DELETE /api/admin/settings/:key
 * Remove a setting (only allowed for encrypted/optional settings).
 */
adminRouter.delete('/settings/:key', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = String(req.params.key);

    if (!ENCRYPTED_SETTINGS.has(key)) {
      res.status(400).json({ error: 'Only optional integration keys can be deleted' });
      return;
    }

    await pool.query(`DELETE FROM app_settings WHERE key = $1`, [key]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/settings/llm-stats/test
 * Tests the stored LLM Stats API key by calling their /v1/models endpoint.
 */
adminRouter.post('/settings/llm-stats/test', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`SELECT value FROM app_settings WHERE key = 'llm_stats_api_key'`);
    if (result.rows.length === 0) {
      res.status(400).json({ ok: false, error: 'No LLM Stats API key configured' });
      return;
    }

    // Decrypt the key
    const buf = Buffer.from(result.rows[0].value, 'base64');
    const apiKey = decrypt(buf, ENCRYPTION_KEY);

    // Call the LLM Stats API
    const testRes = await fetch('https://api.zeroeval.com/stats/v1/models?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });

    if (testRes.ok) {
      const data = await testRes.json() as { models?: any[]; total?: number };
      res.json({ ok: true, models_available: data.total ?? data.models?.length ?? 0 });
    } else {
      const errText = await testRes.text();
      res.json({ ok: false, error: `API returned ${testRes.status}: ${errText}` });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /api/admin/recommend-models
 * Body: { projectDescription: string, preference?: 'cheap'|'balanced'|'powerful', requiresTools?: boolean }
 *
 * Calls a Copilot model with the current catalog as context and asks it to
 * recommend a scope for a new API key. Returns:
 *   { recommended: string[], defaultModel: string|null, reasoning: string, routerModel: string }
 *
 * Used by the API Keys "Help me choose" assistant.
 */
adminRouter.post('/recommend-models', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      projectDescription?: unknown;
      preference?: unknown;
      requiresTools?: unknown;
    };
    const description = typeof body.projectDescription === 'string' ? body.projectDescription.trim() : '';
    if (!description) {
      res.status(400).json({ error: 'projectDescription is required' });
      return;
    }
    const preference =
      body.preference === 'cheap' || body.preference === 'powerful'
        ? body.preference
        : 'balanced';
    const requiresTools = body.requiresTools === true;

    // Build the catalog the router model will reason over.
    const models = await getActiveModels();
    const catalog = models
      .filter((m) => m.chat_enabled)
      .map((m) => {
        const supports = m.capabilities?.supports ?? {};
        return {
          id: m.id,
          name: m.name,
          category: m.category,
          vendor: m.organization ?? m.vendor,
          best_for: m.best_for,
          description: m.description,
          premium_multiplier: m.premium_multiplier,
          retirement_date: m.retirement_date,
          tool_calls: supports.tool_calls === true,
          parallel_tool_calls: supports.parallel_tool_calls === true,
          vision: supports.vision === true,
          thinking: supports.thinking === true,
          structured_outputs: supports.structured_outputs === true,
          context_window: m.capabilities?.context_window ?? m.context_window ?? null,
        };
      });

    if (catalog.length === 0) {
      res.status(503).json({ error: 'No active chat-enabled models available. Run a model sync first.' });
      return;
    }

    // Pick a router model: prefer the configured default, then a sensible fallback.
    const defaultRow = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'default_model'`,
    );
    const configuredDefault = (defaultRow.rows[0]?.value as string | undefined) ?? null;
    const routerCandidates = [
      configuredDefault,
      'gpt-5-mini',
      'gpt-5.4-mini',
      'gpt-4o',
      'gpt-4.1',
    ].filter((v): v is string => typeof v === 'string' && v.length > 0);
    const routerModel =
      routerCandidates.find((id) => catalog.some((c) => c.id === id)) ?? catalog[0].id;

    const systemPrompt = [
      'You are a Copilot model-selection assistant.',
      'Given a project description and a catalog of models that the Wingman proxy can access via GitHub Copilot, recommend which models the user should scope their API key to.',
      'IMPORTANT: The capability flags in the catalog (tool_calls, parallel_tool_calls, vision, thinking, structured_outputs) reflect what GitHub Copilot itself exposes for that model on its /chat/completions endpoint — not what the underlying model might support natively elsewhere. Always honour Copilot\'s view.',
      'Cost guidance: premium_multiplier 0 = included in subscription, 0.33 = light premium, 1 = standard premium, >=3 = heavy premium. Prefer cheaper models unless the project clearly needs more.',
      'Output rules:',
      '- Reply with a single fenced JSON block (```json ... ```) and nothing outside the block.',
      '- Schema: { "recommended": string[], "default": string|null, "reasoning": string }.',
      '- "recommended" must be 1-5 model ids drawn from the catalog. Pick a focused set, not the whole list.',
      '- "default" must be one of the recommended ids, or null. Choose the cheapest one that meets the requirements.',
      '- "reasoning" is 2-4 short sentences explaining the picks for this specific project.',
    ].join('\n');

    const userPrompt = [
      `Project description:\n${description}`,
      '',
      `User preference: ${preference}`,
      `Requires tool calling: ${requiresTools ? 'yes' : 'auto-detect from the description'}`,
      '',
      `Catalog (${catalog.length} models):`,
      JSON.stringify(catalog, null, 2),
    ].join('\n');

    const completion = await chatCompletion({
      model: routerModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
    });

    // Extract the JSON block. Be forgiving — fenced or bare.
    const fenceMatch = completion.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = (fenceMatch?.[1] ?? completion).trim();
    let parsed: { recommended?: unknown; default?: unknown; reasoning?: unknown } = {};
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // try to find the first {...} object in the response
      const objMatch = completion.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { parsed = JSON.parse(objMatch[0]); } catch { /* swallow */ }
      }
    }

    const catalogIds = new Set(catalog.map((c) => c.id));
    const recommended = Array.isArray(parsed.recommended)
      ? parsed.recommended.filter((v): v is string => typeof v === 'string' && catalogIds.has(v))
      : [];
    const defaultModel =
      typeof parsed.default === 'string' && recommended.includes(parsed.default)
        ? parsed.default
        : recommended[0] ?? null;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';

    if (recommended.length === 0) {
      res.status(502).json({
        error: 'Router model did not return a usable recommendation',
        routerModel,
        raw: completion,
      });
      return;
    }

    res.json({ recommended, defaultModel, reasoning, routerModel });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/sessions?source=ui|api_key|all&api_key_id=<uuid>
 * Returns sessions with rolled-up message counts and totals, plus the
 * API key (name + prefix) that drove the most recent request for each.
 * Defaults to 'all' so the admin can audit every conversation.
 */
adminRouter.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const sourceParam = (req.query.source as string | undefined) ?? 'all';
    const source =
      sourceParam === 'ui' || sourceParam === 'api_key' ? sourceParam : undefined;
    const apiKeyId = (req.query.api_key_id as string | undefined) || undefined;
    const sessions = await listSessionsWithStats(200, { source, apiKeyId });
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
    const id = String(req.params.id);

    // Synthetic id format: `apikey:<keyId>:conv:<convId>`
    // These represent stateless API-key conversations grouped from request_log
    // (no chat_sessions row exists). We synthesise a session + a list of
    // per-turn pseudo-messages so the admin UI can render a history view.
    if (id.startsWith('apikey:')) {
      const m = id.match(/^apikey:([^:]+):conv:(.+)$/);
      if (!m) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      const apiKeyId = m[1];
      const convId = m[2];

      const keyMeta = await pool.query<{
        name: string;
        keyPrefix: string;
        createdAt: string;
      }>(
        `SELECT name, key_prefix AS "keyPrefix", created_at AS "createdAt"
         FROM api_keys WHERE id = $1`,
        [apiKeyId]
      );
      if (keyMeta.rowCount === 0) {
        res.status(404).json({ error: 'API key not found' });
        return;
      }

      const rowsRes = await pool.query<{
        id: string;
        model: string | null;
        promptTokens: number | null;
        completionTokens: number | null;
        latencyMs: number | null;
        status: 'success' | 'error';
        errorMessage: string | null;
        endUser: string | null;
        toolCallsCount: number;
        toolsUsed: Array<{ name: string; count: number }> | null;
        hadTools: boolean;
        createdAt: string;
      }>(
        `SELECT id,
                model,
                prompt_tokens AS "promptTokens",
                completion_tokens AS "completionTokens",
                latency_ms AS "latencyMs",
                status,
                error_message AS "errorMessage",
                end_user AS "endUser",
                tool_calls_count AS "toolCallsCount",
                tools_used AS "toolsUsed",
                had_tools AS "hadTools",
                created_at AS "createdAt"
         FROM request_log
         WHERE api_key_id = $1 AND conversation_id = $2
         ORDER BY created_at ASC`,
        [apiKeyId, convId]
      );

      if (rowsRes.rowCount === 0) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const rows = rowsRes.rows;
      const first = rows[0];
      const last = rows[rows.length - 1];

      // Build a markdown-formatted summary for each request_log row so the
      // existing ChatMarkdown renderer in the admin UI presents it nicely.
      // We have no prompt/response text in request_log, so this is a
      // metadata-only history view.
      const messages = rows.map((r) => {
        const lines: string[] = [];
        lines.push(`**${r.status === 'success' ? '✓' : '✗'} ${r.model ?? 'unknown model'}**`);
        const meta: string[] = [];
        if (r.promptTokens !== null || r.completionTokens !== null) {
          meta.push(
            `${r.promptTokens ?? 0} in · ${r.completionTokens ?? 0} out tok`
          );
        }
        if (r.latencyMs !== null) meta.push(`${r.latencyMs} ms`);
        if (r.hadTools) meta.push(`tools offered`);
        if (r.toolCallsCount > 0) meta.push(`${r.toolCallsCount} tool calls`);
        if (meta.length) lines.push(meta.join(' · '));
        if (r.toolsUsed && r.toolsUsed.length > 0) {
          lines.push('');
          lines.push('Tools used:');
          for (const t of r.toolsUsed) {
            lines.push(`- \`${t.name}\` × ${t.count}`);
          }
        }
        if (r.errorMessage) {
          lines.push('');
          lines.push('```');
          lines.push(r.errorMessage);
          lines.push('```');
        }
        return {
          id: r.id,
          role: 'assistant' as const,
          content: lines.join('\n'),
          tokenCount:
            (r.promptTokens ?? 0) + (r.completionTokens ?? 0) || null,
          createdAt: r.createdAt,
        };
      });

      const endUser = rows.find((r) => r.endUser)?.endUser ?? null;
      const session = {
        id,
        sessionKey: `${keyMeta.rows[0].name} · ${convId}`,
        systemPrompt: endUser
          ? `Stateless API conversation. end_user = ${endUser}`
          : 'Stateless API conversation.',
        source: 'api_key' as const,
        createdAt: first.createdAt,
        updatedAt: last.createdAt,
      };

      res.json({ session, messages });
      return;
    }

    const session = await getSessionById(id);
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
