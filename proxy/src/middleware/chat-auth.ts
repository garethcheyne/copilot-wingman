import type { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/api-keys.js';

/**
 * Chat endpoint auth — accepts either:
 * 1. INTERNAL_API_KEY (x-api-key header) — used by the built-in web UI
 * 2. User API key (Authorization: Bearer wm_...) — used by external services
 *
 * On success, attaches `req.apiKeyRecord` (if API key used) for downstream
 * scope/rate-limit enforcement.
 */
export async function chatAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const internalKey = process.env.INTERNAL_API_KEY;

  // Option 1: Internal API key (web UI → proxy)
  const xApiKey = req.headers['x-api-key'] as string | undefined;
  if (xApiKey) {
    if (!internalKey) {
      // No key configured — dev mode, allow
      next();
      return;
    }
    if (xApiKey === internalKey) {
      next();
      return;
    }
    // Not the internal key — fall through to check as user API key
  }

  // Option 2: Bearer token (external services)
  const authHeader = req.headers['authorization'] as string | undefined;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Also accept wm_ keys in x-api-key header (convenience)
  const candidateKey = bearerToken ?? (xApiKey?.startsWith('wm_') ? xApiKey : null);

  if (candidateKey) {
    try {
      const apiKey = await validateApiKey(candidateKey);
      if (apiKey) {
        // Check model scope if the request specifies a model
        const requestedModel = req.body?.model;
        if (requestedModel && apiKey.scopes.length > 0 && !apiKey.scopes.includes(requestedModel)) {
          res.status(403).json({
            error: `API key not authorized for model '${requestedModel}'`,
            allowed_models: apiKey.scopes,
          });
          return;
        }

        (req as any).apiKeyRecord = apiKey;

        // Apply default model if the request doesn't specify one
        if (!req.body?.model && apiKey.defaultModel) {
          req.body = req.body ?? {};
          req.body.model = apiKey.defaultModel;
        }

        next();
        return;
      }
    } catch (err) {
      console.error('[auth] API key validation error:', err);
    }
  }

  res.status(401).json({ error: 'Unauthorized — provide a valid API key via Authorization: Bearer <key>' });
}
