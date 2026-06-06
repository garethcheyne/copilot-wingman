import { pool } from '../db/client.js';

export interface Session {
  id: string;
  sessionKey: string;
  systemPrompt: string | null;
  source: 'ui' | 'api_key';
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tokenCount: number | null;
  createdAt: Date;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
  name?: string | null;
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
  role: 'system' | 'user' | 'assistant' | 'tool',
  content: string | null,
  tokenCount?: number,
  opts?: { toolCalls?: ToolCall[] | null; toolCallId?: string | null; name?: string | null }
): Promise<Message> {
  const result = await pool.query<Message>(
    `INSERT INTO chat_messages (session_id, role, content, token_count, tool_calls, tool_call_id, name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, session_id AS "sessionId", role, content,
               token_count AS "tokenCount", created_at AS "createdAt",
               tool_calls AS "toolCalls", tool_call_id AS "toolCallId", name`,
    [
      sessionId,
      role,
      content,
      tokenCount ?? null,
      opts?.toolCalls ? JSON.stringify(opts.toolCalls) : null,
      opts?.toolCallId ?? null,
      opts?.name ?? null,
    ]
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
            token_count AS "tokenCount", created_at AS "createdAt",
            tool_calls AS "toolCalls", tool_call_id AS "toolCallId", name
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
async function listSessions(limit = 50): Promise<Session[]> {
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
  // Populated for stateless API-key conversations (synthetic rows). NULL for
  // real UI chat_sessions rows.
  endUser: string | null;
  conversationId: string | null;
  toolCalls: number;
}

export interface ListSessionsFilter {
  source?: 'ui' | 'api_key';
  apiKeyId?: string;
}

/**
 * List sessions with rolled-up stats — used by the admin Sessions page.
 *
 * Returns a single unified list:
 *   • Real UI chat_sessions rows joined with their last API key (if any)
 *   • Synthetic "API conversation" rows for stateless API-key traffic that
 *     supplied an X-Wingman-Conversation header, grouped by
 *     (api_key_id, conversation_id, end_user). Their `id` is a non-UUID
 *     synthetic key `apikey:<keyid>:conv:<convid>` — the admin UI treats
 *     these as read-only (no DB row to open or delete).
 */
export async function listSessionsWithStats(
  limit = 100,
  filter: ListSessionsFilter = {}
): Promise<SessionSummary[]> {
  const wantsUi = filter.source !== 'api_key';
  const wantsApi = filter.source !== 'ui';

  const tasks: Promise<SessionSummary[]>[] = [];

  if (wantsUi) {
    const where: string[] = [];
    const params: (number | string)[] = [limit];
    if (filter.apiKeyId) {
      params.push(filter.apiKeyId);
      where.push(`k.id = $${params.length}`);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    tasks.push(
      pool.query<SessionSummary>(
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
                k.key_prefix        AS "apiKeyPrefix",
                NULL::text          AS "endUser",
                NULL::text          AS "conversationId",
                0::int              AS "toolCalls"
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
      ).then((r) => r.rows)
    );
  }

  if (wantsApi) {
    const where: string[] = [
      `rl.source = 'api_key'`,
      `rl.conversation_id IS NOT NULL`,
      // Exclude conversations that now have a real chat_sessions row (avoid duplicates)
      `NOT EXISTS (SELECT 1 FROM chat_sessions cs WHERE cs.session_key = 'completions:' || rl.api_key_id || ':' || rl.conversation_id)`,
    ];
    const params: (number | string)[] = [limit];
    if (filter.apiKeyId) {
      params.push(filter.apiKeyId);
      where.push(`rl.api_key_id = $${params.length}`);
    }

    tasks.push(
      pool.query<SessionSummary>(
        `SELECT
            ('apikey:' || rl.api_key_id || ':conv:' || rl.conversation_id) AS id,
            NULL::text                                  AS "sessionKey",
            NULL::text                                  AS "systemPrompt",
            'api_key'                                   AS source,
            MIN(rl.created_at)                          AS "createdAt",
            MAX(rl.created_at)                          AS "updatedAt",
            COUNT(*)::int                               AS "messageCount",
            MAX(rl.created_at)                          AS "lastMessageAt",
            COALESCE(SUM(COALESCE(rl.prompt_tokens, 0) + COALESCE(rl.completion_tokens, 0)), 0)::int AS "totalTokens",
            ('Conversation ' || rl.conversation_id)     AS preview,
            rl.api_key_id                               AS "apiKeyId",
            ak.name                                     AS "apiKeyName",
            ak.key_prefix                               AS "apiKeyPrefix",
            rl.end_user                                 AS "endUser",
            rl.conversation_id                          AS "conversationId",
            COALESCE(SUM(rl.tool_calls_count), 0)::int  AS "toolCalls"
         FROM request_log rl
         JOIN api_keys ak ON ak.id = rl.api_key_id
         WHERE ${where.join(' AND ')}
         GROUP BY rl.api_key_id, rl.conversation_id, rl.end_user, ak.name, ak.key_prefix
         ORDER BY MAX(rl.created_at) DESC
         LIMIT $1`,
        params
      ).then((r) => r.rows)
    );
  }

  const results = await Promise.all(tasks);
  const merged = results.flat();
  // Sort by most-recent activity across both kinds, then trim to limit.
  merged.sort((a, b) => {
    const ta = new Date(a.updatedAt ?? 0).getTime();
    const tb = new Date(b.updatedAt ?? 0).getTime();
    return tb - ta;
  });
  return merged.slice(0, limit);
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
async function setMessageTokenCount(messageId: string, tokenCount: number): Promise<void> {
  await pool.query(
    `UPDATE chat_messages SET token_count = $1 WHERE id = $2`,
    [tokenCount, messageId]
  );
}
