import { Router } from 'express';
import type { Request, Response } from 'express';
import { getActiveModels, getModelsByIds } from '../services/model-sync.js';
import type { StoredModel } from '../services/model-sync.js';

export const modelsRouter = Router();

/** Shape a DB row into a clean API response object */
function formatModel(m: StoredModel) {
  const caps = m.capabilities;
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

/**
 * GET /api/models
 *
 * Returns ONLY the models assigned to the caller's API key, read from the DB
 * (populated by the model sync service). API key users never see the full catalog.
 *
 * Internal key (web UI) gets all active models.
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

    const models = dbModels.map(formatModel);

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
