import type { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/api-keys.js';
import { lookupSessionByRawToken } from '../services/sessions.js';

/**
 * Chat endpoint auth — accepts either:
 * 1. Browser session token (`x-session-token` header) — the built-in web UI,
 *    after the user has logged in.
 * 2. User API key (`Authorization: Bearer wm_...` or `x-api-key: wm_...`) —
 *    external services.
 *
 * The legacy `INTERNAL_API_KEY` path is intentionally not accepted here: the
 * web UI used to send it from the browser, which meant the key was inlined
 * into the public JS bundle. All browser chat traffic now uses the same
 * session token system as the admin routes.
 *
 * On success, attaches `req.apiKeyRecord` (API key path) or `req.user`
 * (session path) for downstream scope / rate-limit enforcement.
 */
export async function chatAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Option 1: Browser session token (web UI → proxy)
  const sessionToken = req.headers['x-session-token'] as string | undefined;
  if (sessionToken) {
    try {
      const user = await lookupSessionByRawToken(sessionToken);
      if (user) {
        (req as any).user = user;
        next();
        return;
      }
    } catch (err) {
      console.error('[auth] session validation error:', err);
    }
    res.status(401).json({ error: 'Unauthorized — invalid or expired session' });
    return;
  }

  // Option 2: Bearer token (external services)
  const authHeader = req.headers['authorization'] as string | undefined;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Also accept wm_ keys in x-api-key header (convenience for external callers)
  const xApiKey = req.headers['x-api-key'] as string | undefined;
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

  res.status(401).json({
    error: 'Unauthorized — provide a session token (x-session-token) or an API key (Authorization: Bearer wm_...)',
  });
}
