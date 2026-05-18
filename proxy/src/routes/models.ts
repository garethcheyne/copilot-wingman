import { Router } from 'express';
import type { Request, Response } from 'express';
import { getActiveModels, getModelsByIds } from '../services/model-sync.js';
import type { StoredModel } from '../services/model-sync.js';

export const modelsRouter = Router();

/** Shape a DB row into a clean API response object */
function formatModel(m: StoredModel) {
  const caps = m.capabilities;
  const supports = (caps?.supports ?? {}) as Record<string, boolean | undefined>;
  return {
    id: m.id,
    name: m.name,
    vendor: m.vendor,
    version: m.version,
    preview: m.preview,
    category: m.category,
    chat_enabled: m.chat_enabled,
    supported_endpoints: m.supported_endpoints,
    description: m.description,
    best_for: m.best_for,
    premium_multiplier: m.premium_multiplier,
    supports_tools: supports.tool_calls === true,
    capabilities: caps
      ? {
          type: caps.type,
          family: caps.family,
          context_window: caps.context_window ?? null,
          max_output_tokens: caps.max_output_tokens ?? null,
          supports: caps.supports ?? {},
        }
      : null,
  };
}

type FormattedModel = ReturnType<typeof formatModel>;

/** Parse comma-separated query param into a clean list of capability flag names. */
function parseSupports(raw: unknown): string[] {
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((v) => String(v).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * GET /api/models
 *
 * Returns ONLY the models assigned to the caller's API key, read from the DB
 * (populated by the model sync service). API key users never see the full catalog.
 *
 * Internal key (web UI) gets all active models.
 *
 * Optional query params:
 *   ?supports=tool_calls            — only models supporting this capability
 *   ?supports=tool_calls,vision     — AND semantics (must support all listed)
 *   ?endpoint=/chat/completions     — only models on the given upstream endpoint
 *   ?chat_only=true                 — convenience: chat_enabled=true
 *
 * Filters run AFTER the API-key scope check, so they cannot widen scope.
 */
modelsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const apiKey = (req as any).apiKeyRecord;

    let dbModels: StoredModel[];
    if (apiKey?.scopes?.length) {
      // API key user — only their assigned models
      dbModels = await getModelsByIds(apiKey.scopes);
    } else {
      // Internal key (web UI) — all active models
      dbModels = await getActiveModels();
    }

    let models: FormattedModel[] = dbModels.map(formatModel);

    // ─ filtering ────────────────────────────────────────────────────────────
    const supports = parseSupports(req.query.supports);
    if (supports.length) {
      models = models.filter((m) => {
        const s = (m.capabilities?.supports ?? {}) as Record<string, boolean | undefined>;
        return supports.every((flag) => s[flag] === true);
      });
    }

    const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : null;
    if (endpoint) {
      models = models.filter((m) => {
        const eps = m.supported_endpoints ?? [];
        return eps.length === 0 || eps.includes(endpoint);
      });
    }

    if (req.query.chat_only === 'true' || req.query.chat_only === '1') {
      models = models.filter((m) => m.chat_enabled);
    }

    res.json({
      models,
      default_model: apiKey?.defaultModel ?? null,
      total: models.length,
      chat_capable: models.filter((m) => m.chat_enabled).length,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
