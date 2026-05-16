import { Router } from 'express';
import type { Request, Response } from 'express';
import { validateConnection } from '../services/copilot-token.js';
import { checkDb } from '../db/client.js';

export const healthRouter = Router();

/**
 * GET /health
 */
healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const dbOk = await checkDb();
  const connectionStatus = await validateConnection();

  const healthy = dbOk && connectionStatus.ok;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks: {
      database: dbOk ? 'connected' : 'unreachable',
      github: connectionStatus.ok
        ? { status: 'connected', username: connectionStatus.username }
        : { status: 'error', error: connectionStatus.error },
    },
    timestamp: new Date().toISOString(),
  });
});
