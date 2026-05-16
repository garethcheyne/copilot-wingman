import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { chatRouter } from './routes/chat.js';
import { healthRouter } from './routes/health.js';
import { adminRouter } from './routes/admin.js';
import { apiKeysRouter } from './routes/api-keys.js';
import { authRouter } from './routes/auth.js';
import { modelsRouter } from './routes/models.js';
import { openApiRouter } from './routes/openapi.js';
import { versionRouter } from './routes/version.js';
import { startModelSync } from './services/model-sync.js';
import { seedLlmStatsKeyFromEnv } from './services/llm-stats-seed.js';
import { chatAuthMiddleware } from './middleware/chat-auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { sessionAuthMiddleware } from './middleware/session-auth.js';

const app = express();
const PORT = parseInt(process.env.PROXY_PORT ?? '3200', 10);

// CORS — allow any localhost origin (dev on various ports)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Body parsing (20mb for base64 image uploads)
app.use(express.json({ limit: '20mb' }));

// Health — no auth required
app.use('/health', healthRouter);

// OpenAPI spec — public, documents only API-key-facing endpoints
app.use('/openapi.json', openApiRouter);

// Auth routes — no auth required (login/setup/status)
app.use('/api/auth', authRouter);

// Admin routes — require valid user session
app.use('/api/admin/api-keys', sessionAuthMiddleware, apiKeysRouter);
app.use('/api/admin/version', sessionAuthMiddleware, versionRouter);
app.use('/api/admin', sessionAuthMiddleware, adminRouter);

// Models endpoint — same auth as chat (internal key or API key)
app.use('/api/models', chatAuthMiddleware, modelsRouter);

// Chat routes — accept INTERNAL_API_KEY (web UI) or user API key (external services)
app.use('/api/chat', chatAuthMiddleware, rateLimitMiddleware, chatRouter);

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[proxy] Copilot proxy listening on port ${PORT}`);

  // Seed LLM Stats key from env if not already in DB
  seedLlmStatsKeyFromEnv().catch(err => {
    console.error('[proxy] LLM Stats key seed failed:', err.message);
  });

  // Start background model sync (fetches upstream, populates DB)
  startModelSync().catch(err => {
    console.error('[proxy] Model sync startup failed:', err.message);
  });
});

export default app;
