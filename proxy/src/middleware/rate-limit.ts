import type { Request, Response, NextFunction } from 'express';

const windowMs = 60_000; // 1 minute
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX ?? '30', 10);

// Simple in-memory rate limiter (swap for Redis-backed in production)
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = (req.headers['x-user-id'] as string) ?? req.ip ?? 'unknown';
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
