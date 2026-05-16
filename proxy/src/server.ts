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
import { authRouter } from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';

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

// Auth routes — no API key required (login/setup/status)
app.use('/api/auth', authRouter);

// Admin routes — local-only, separate from internal API key
app.use('/api/admin', adminRouter);

// Chat routes — require internal API key + rate limit
app.use('/api/chat', authMiddleware, rateLimitMiddleware, chatRouter);

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[proxy] Copilot proxy listening on port ${PORT}`);
});

export default app;
