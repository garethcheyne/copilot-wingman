import type { Request, Response, NextFunction } from 'express';

const windowMs = 60_000; // 1 minute
const DEFAULT_LIMIT = parseInt(process.env.RATE_LIMIT_MAX ?? '30', 10);

// Simple in-memory rate limiter (swap for Redis-backed in production)
const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Per-identity rate limiter. The bucket key is derived from the
 * authenticated principal (API key id or session user id) set by the auth
 * middleware that ran before us. We fall back to the connecting IP for
 * unauthenticated requests so a misconfigured route still gets *some*
 * protection — and we deliberately ignore any client-supplied identity
 * headers (`x-user-id` etc.) since those are trivially forgeable.
 *
 * For API keys, the per-key `rate_limit` column overrides the global
 * `RATE_LIMIT_MAX` env var.
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKeyRecord = (req as any).apiKeyRecord as { id: string; rateLimit?: number } | undefined;
  const sessionUser = (req as any).user as { id: string } | undefined;

  let key: string;
  let maxRequests = DEFAULT_LIMIT;

  if (apiKeyRecord) {
    key = `apikey:${apiKeyRecord.id}`;
    if (typeof apiKeyRecord.rateLimit === 'number' && apiKeyRecord.rateLimit > 0) {
      maxRequests = apiKeyRecord.rateLimit;
    }
  } else if (sessionUser) {
    key = `user:${sessionUser.id}`;
  } else {
    key = `ip:${req.ip ?? 'unknown'}`;
  }

  const now = Date.now();

  let entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    hits.set(key, entry);
  }

  entry.count++;

  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());

  if (entry.count > maxRequests) {
    res.status(429).json({ error: 'Rate limit exceeded — try again later' });
    return;
  }

  next();
}
