/**
 * Database Purge Service
 *
 * Periodically deletes old data that exceeds the retention window.
 * Runs once on startup, then every 24 hours.
 *
 * Tables purged:
 *   - chat_sessions (+ cascade to chat_messages) older than RETENTION_DAYS
 *   - request_log older than RETENTION_DAYS
 *   - user_sessions that expired more than 7 days ago
 */

import { pool } from '../db/client.js';

const RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '120', 10);
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function purge(): Promise<void> {
  const client = await pool.connect();
  try {
    // Chat sessions + messages (CASCADE deletes messages automatically)
    const sessions = await client.query(
      `DELETE FROM chat_sessions WHERE updated_at < NOW() - INTERVAL '1 day' * $1`,
      [RETENTION_DAYS]
    );

    // Request log telemetry
    const requests = await client.query(
      `DELETE FROM request_log WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [RETENTION_DAYS]
    );

    // Expired user sessions (keep 7 days after expiry for audit trail)
    const expired = await client.query(
      `DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '7 days'`
    );

    const total = (sessions.rowCount ?? 0) + (requests.rowCount ?? 0) + (expired.rowCount ?? 0);
    if (total > 0) {
      console.log(
        `[db-purge] Purged: ${sessions.rowCount} sessions, ` +
        `${requests.rowCount} request_log rows, ` +
        `${expired.rowCount} expired user_sessions ` +
        `(retention: ${RETENTION_DAYS}d)`
      );
    }
  } catch (err: any) {
    console.error('[db-purge] Error:', err.message);
  } finally {
    client.release();
  }
}

export async function startDbPurge(): Promise<void> {
  // Initial run after a short delay (let migrations complete first)
  setTimeout(() => {
    purge().catch(err => console.error('[db-purge] Initial run failed:', err.message));
  }, 10_000);

  // Then every 24 hours
  setInterval(() => {
    purge().catch(err => console.error('[db-purge] Scheduled run failed:', err.message));
  }, INTERVAL_MS);

  console.log(`[db-purge] Scheduled (retention: ${RETENTION_DAYS}d, interval: 24h)`);
}
