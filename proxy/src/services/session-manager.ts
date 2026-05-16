import { pool } from '../db/client.js';

export interface Session {
  id: string;
  sessionKey: string;
  systemPrompt: string | null;
  source: 'ui' | 'api_key';
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokenCount: number | null;
  createdAt: Date;
}

/**
 * Get or create a session by its key.
 */
export async function getOrCreateSession(sessionKey: string, systemPrompt?: string, source: 'ui' | 'api_key' = 'ui'): Promise<Session> {
  // Try to find existing
  const existing = await pool.query<Session>(
    `SELECT id, session_key AS "sessionKey", system_prompt AS "systemPrompt",
            source, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chat_sessions WHERE session_key = $1`,
    [sessionKey]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new
  const created = await pool.query<Session>(
    `INSERT INTO chat_sessions (session_key, system_prompt, source)
     VALUES ($1, $2, $3)
     RETURNING id, session_key AS "sessionKey", system_prompt AS "systemPrompt",
               source, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [sessionKey, systemPrompt ?? null, source]
  );

  return created.rows[0];
}

/**
 * Add a message to a session.
 */
export async function addMessage(
  sessionId: string,
  role: 'system' | 'user' | 'assistant',
  content: string,
  tokenCount?: number
): Promise<Message> {
  const result = await pool.query<Message>(
    `INSERT INTO chat_messages (session_id, role, content, token_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id, session_id AS "sessionId", role, content,
               token_count AS "tokenCount", created_at AS "createdAt"`,
    [sessionId, role, content, tokenCount ?? null]
  );

  // Touch session updated_at
  await pool.query(
    `UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );

  return result.rows[0];
}

/**
 * Get all messages for a session, ordered by creation time.
 */
export async function getMessages(sessionId: string): Promise<Message[]> {
  const result = await pool.query<Message>(
    `SELECT id, session_id AS "sessionId", role, content,
            token_count AS "tokenCount", created_at AS "createdAt"
     FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  return result.rows;
}

/**
 * List all sessions, most recent first.
 */
export async function listSessions(limit = 50): Promise<Session[]> {
  const result = await pool.query<Session>(
    `SELECT id, session_key AS "sessionKey", system_prompt AS "systemPrompt",
            source, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chat_sessions
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

export interface SessionSummary extends Session {
  messageCount: number;
  lastMessageAt: Date | null;
  totalTokens: number | null;
  preview: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
}

export interface ListSessionsFilter {
  source?: 'ui' | 'api_key';
  apiKeyId?: string;
}

/**
 * List sessions with rolled-up stats — used by the admin Sessions page.
 * Joins `request_log` to surface which API key (if any) drove the session.
 */
export async function listSessionsWithStats(
  limit = 100,
  filter: ListSessionsFilter = {}
): Promise<SessionSummary[]> {
  const where: string[] = [];
  const params: (number | string)[] = [limit];

  if (filter.source) {
    params.push(filter.source);
    where.push(`s.source = $${params.length}`);
  }
  if (filter.apiKeyId) {
    params.push(filter.apiKeyId);
    where.push(`k.id = $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const result = await pool.query<SessionSummary>(
    `SELECT s.id,
            s.session_key       AS "sessionKey",
            s.system_prompt     AS "systemPrompt",
            s.source,
            s.created_at        AS "createdAt",
            s.updated_at        AS "updatedAt",
            COALESCE(m.cnt, 0)::int  AS "messageCount",
            m.last_at           AS "lastMessageAt",
            m.total_tokens      AS "totalTokens",
            p.preview,
            k.id                AS "apiKeyId",
            k.name              AS "apiKeyName",
            k.key_prefix        AS "apiKeyPrefix"
     FROM chat_sessions s
     LEFT JOIN (
       SELECT session_id,
              COUNT(*)::int AS cnt,
              MAX(created_at) AS last_at,
              SUM(token_count)::int AS total_tokens
       FROM chat_messages
       GROUP BY session_id
     ) m ON m.session_id = s.id
     LEFT JOIN LATERAL (
       SELECT LEFT(content, 100) AS preview
       FROM chat_messages
       WHERE session_id = s.id AND role = 'user'
       ORDER BY created_at ASC
       LIMIT 1
     ) p ON true
     LEFT JOIN LATERAL (
       SELECT ak.id, ak.name, ak.key_prefix
       FROM request_log rl
       JOIN api_keys ak ON ak.id = rl.api_key_id
       WHERE rl.session_id = s.id
       ORDER BY rl.created_at DESC
       LIMIT 1
     ) k ON true
     ${whereClause}
     ORDER BY s.updated_at DESC
     LIMIT $1`,
    params
  );

  return result.rows;
}

/**
 * Get one session by id.
 */
export async function getSessionById(id: string): Promise<Session | null> {
  const result = await pool.query<Session>(
    `SELECT id, session_key AS "sessionKey", system_prompt AS "systemPrompt",
            source, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM chat_sessions WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Delete a session and cascade its messages.
 */
export async function deleteSession(id: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM chat_sessions WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Update token count for a specific message — used by chat.ts after we count.
 */
export async function setMessageTokenCount(messageId: string, tokenCount: number): Promise<void> {
  await pool.query(
    `UPDATE chat_messages SET token_count = $1 WHERE id = $2`,
    [tokenCount, messageId]
  );
}
