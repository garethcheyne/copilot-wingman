/**
 * Seed the LLM Stats API key from the LLM_STATS_KEY env var into the DB
 * (encrypted) on first startup. If a key is already stored, this is a no-op.
 */

import { pool } from '../db/client.js';
import { encrypt } from './crypto.js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';

export async function seedLlmStatsKeyFromEnv(): Promise<void> {
  const envKey = process.env.LLM_STATS_KEY;
  if (!envKey) return;

  // Check if already stored
  const existing = await pool.query(
    `SELECT 1 FROM app_settings WHERE key = 'llm_stats_api_key'`
  );
  if (existing.rows.length > 0) return;

  // Encrypt and store
  const encrypted = encrypt(envKey, ENCRYPTION_KEY);
  const b64 = encrypted.toString('base64');

  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('llm_stats_api_key', $1, NOW())
     ON CONFLICT (key) DO NOTHING`,
    [b64]
  );

  console.log('[seed] LLM Stats API key imported from env → encrypted in DB');
}
