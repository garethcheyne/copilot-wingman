import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  updateApiKey,
  deleteApiKey,
} from '../services/api-keys.js';

export const apiKeysRouter = Router();

/**
 * GET /api/admin/api-keys
 * List all API keys (no secrets).
 */
apiKeysRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const keys = await listApiKeys();
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/admin/api-keys
 * Create a new API key.
 * Body: { name, scopes?, rateLimit?, expiresAt? }
 * Returns the raw key ONCE — it cannot be retrieved again.
 */
apiKeysRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, scopes, defaultModel, rateLimit, expiresAt } = req.body as {
      name?: string;
      scopes?: string[];
      defaultModel?: string;
      rateLimit?: number;
      expiresAt?: string;
    };

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const userId = (req as any).user?.id ?? null;

    const { apiKey, rawKey } = await createApiKey({
      name: name.trim(),
      scopes: scopes ?? [],
      defaultModel: defaultModel ?? null,
      rateLimit: rateLimit ?? 30,
      expiresAt: expiresAt ?? null,
      createdBy: userId,
    });

    res.status(201).json({ apiKey, rawKey });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/api-keys/:id
 * Get a single API key by ID.
 */
apiKeysRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await getApiKeyById(String(req.params.id));
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    res.json({ apiKey: key });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * PATCH /api/admin/api-keys/:id
 * Update an API key.
 * Body: { name?, scopes?, defaultModel?, rateLimit?, expiresAt?, isActive? }
 */
apiKeysRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, scopes, defaultModel, rateLimit, expiresAt, isActive } = req.body;
    const updated = await updateApiKey(String(req.params.id), {
      name, scopes, defaultModel, rateLimit, expiresAt, isActive,
    });

    if (!updated) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json({ apiKey: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * DELETE /api/admin/api-keys/:id
 * Permanently delete an API key.
 */
apiKeysRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await deleteApiKey(String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
