import crypto from 'node:crypto';
import { pool } from '../db/client.js';

const SESSION_DURATION_DAYS = 30;
const RAW_TOKEN_BYTES = 32; // 256 bits of entropy → 64 hex chars
const HASH_PREFIX = 'sh1:'; // versioned prefix so we can rotate hash algos

/**
 * Session tokens are issued as random hex strings to the client, but only the
 * SHA-256 hash is stored in the DB. A leaked DB snapshot therefore can't be
 * used to impersonate logged-in users.
 *
 * The stored value is `sh1:<hex>` so we can introduce a new hash algorithm
 * later without ambiguity (sh2:..., argon2:..., etc.).
 */
export function hashToken(rawToken: string): string {
  return HASH_PREFIX + crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateRawToken(): string {
  return crypto.randomBytes(RAW_TOKEN_BYTES).toString('hex');
}

export function sessionDurationMs(): number {
  return SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
}

export interface SessionUser {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
}

/**
 * Issue a new session for a user. Returns the raw token (to send to the
 * client); only the hash is persisted.
 */
export async function createSession(userId: string): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + sessionDurationMs());
  await pool.query(
    `INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(rawToken), expiresAt],
  );
  return { rawToken, expiresAt };
}

/**
 * Look up an active session by the raw token presented by the client.
 * Returns the user record on hit, null on miss / expiry.
 */
export async function lookupSessionByRawToken(rawToken: string): Promise<SessionUser | null> {
  if (!rawToken) return null;
  const result = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.role
     FROM user_sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [hashToken(rawToken)],
  );
  return result.rows[0] ?? null;
}

/**
 * Delete a single session by its raw token. Used by /logout. No-op if the
 * token doesn't match anything.
 */
export async function deleteSessionByRawToken(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await pool.query(`DELETE FROM user_sessions WHERE token = $1`, [hashToken(rawToken)]);
}
