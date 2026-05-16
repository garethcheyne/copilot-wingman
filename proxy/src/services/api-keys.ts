import crypto from 'crypto';
import { pool } from '../db/client.js';

const KEY_PREFIX = 'wm_';

/** Generate a cryptographically random API key: wm_<48 hex chars> */
function generateKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString('hex');
}

/** SHA-256 hash of the full key (what we store) */
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Extract display prefix from a full key (first 8 chars after wm_) */
function extractPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 8);
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  defaultModel: string | null;
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  defaultModel?: string | null;
  rateLimit?: number;
  expiresAt?: string | null;
  createdBy?: string;
}

function rowToApiKey(row: any): ApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes ?? [],
    defaultModel: row.default_model ?? null,
    rateLimit: row.rate_limit,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    requestCount: Number(row.request_count),
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new API key. Returns the key object + the raw key (only shown once).
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<{ apiKey: ApiKey; rawKey: string }> {
  const rawKey = generateKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = extractPrefix(rawKey);

  const result = await pool.query(
    `INSERT INTO api_keys (name, key_prefix, key_hash, scopes, default_model, rate_limit, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.name,
      keyPrefix,
      keyHash,
      input.scopes ?? [],
      input.defaultModel ?? null,
      input.rateLimit ?? 30,
      input.expiresAt ?? null,
      input.createdBy ?? null,
    ]
  );

  return { apiKey: rowToApiKey(result.rows[0]), rawKey };
}

/** List all API keys (no secrets exposed). */
export async function listApiKeys(): Promise<ApiKey[]> {
  const result = await pool.query(
    `SELECT * FROM api_keys ORDER BY created_at DESC`
  );
  return result.rows.map(rowToApiKey);
}

/** Get a single API key by ID. */
export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  const result = await pool.query(`SELECT * FROM api_keys WHERE id = $1`, [id]);
  return result.rows.length > 0 ? rowToApiKey(result.rows[0]) : null;
}

/** Update an API key (name, scopes, rate limit, active status, expiry). */
export async function updateApiKey(
  id: string,
  updates: Partial<Pick<CreateApiKeyInput, 'name' | 'scopes' | 'defaultModel' | 'rateLimit' | 'expiresAt'> & { isActive: boolean }>
): Promise<ApiKey | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
  if (updates.scopes !== undefined) { fields.push(`scopes = $${idx++}`); values.push(updates.scopes); }
  if (updates.defaultModel !== undefined) { fields.push(`default_model = $${idx++}`); values.push(updates.defaultModel); }
  if (updates.rateLimit !== undefined) { fields.push(`rate_limit = $${idx++}`); values.push(updates.rateLimit); }
  if (updates.expiresAt !== undefined) { fields.push(`expires_at = $${idx++}`); values.push(updates.expiresAt); }
  if (updates.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(updates.isActive); }

  if (fields.length === 0) return getApiKeyById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE api_keys SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows.length > 0 ? rowToApiKey(result.rows[0]) : null;
}

/** Delete (hard-delete) an API key. */
export async function deleteApiKey(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Validate a raw API key from a request header.
 * Returns the key record if valid, null otherwise.
 * Also updates last_used_at and request_count.
 */
export async function validateApiKey(rawKey: string): Promise<ApiKey | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashKey(rawKey);
  const result = await pool.query(
    `SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true`,
    [keyHash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Check expiry
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null;
  }

  // Update usage stats (fire and forget)
  pool.query(
    `UPDATE api_keys SET last_used_at = NOW(), request_count = request_count + 1 WHERE id = $1`,
    [row.id]
  ).catch(() => {});

  return rowToApiKey(row);
}
