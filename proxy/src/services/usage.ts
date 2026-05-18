import { pool } from '../db/client.js';

export type UsageWindow = '24h' | '7d' | '30d';

export interface ToolUsage {
  name: string;
  count: number;
}

export interface LogRequestInput {
  sessionId: string | null;
  apiKeyId?: string | null;
  source: 'ui' | 'api_key';
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  status: 'success' | 'error';
  errorMessage?: string | null;
  // Multi-tenant attribution supplied by the calling app (optional).
  endUser?: string | null;
  conversationId?: string | null;
  // Tool-call telemetry derived from the upstream response (optional).
  hadTools?: boolean;
  toolCallsCount?: number;
  toolsUsed?: ToolUsage[] | null;
}

export async function logRequest(input: LogRequestInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO request_log
         (session_id, api_key_id, source, model,
          prompt_tokens, completion_tokens, latency_ms, status, error_message,
          end_user, conversation_id,
          tool_calls_count, tools_used, had_tools)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        input.sessionId,
        input.apiKeyId ?? null,
        input.source,
        input.model,
        input.promptTokens,
        input.completionTokens,
        input.latencyMs,
        input.status,
        input.errorMessage ?? null,
        input.endUser ?? null,
        input.conversationId ?? null,
        input.toolCallsCount ?? 0,
        input.toolsUsed && input.toolsUsed.length > 0 ? JSON.stringify(input.toolsUsed) : null,
        input.hadTools ?? false,
      ]
    );
  } catch (err) {
    // Telemetry must never break the request — log and swallow.
    console.error('[usage] Failed to log request:', (err as Error).message);
  }
}

function windowInterval(window: UsageWindow): string {
  switch (window) {
    case '24h': return '24 hours';
    case '7d':  return '7 days';
    case '30d': return '30 days';
  }
}

function bucketSize(window: UsageWindow): string {
  // Sub-day windows get hourly buckets; multi-day windows get daily.
  return window === '24h' ? 'hour' : 'day';
}

export interface UsageSummary {
  window: UsageWindow;
  totals: {
    requests: number;
    successRequests: number;
    errorRequests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgLatencyMs: number | null;
    p50LatencyMs: number | null;
    p99LatencyMs: number | null;
    toolOfferedRequests: number;
    toolCalls: number;
  };
  timeSeries: Array<{
    bucket: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    errorCount: number;
  }>;
  byModel: Array<{
    model: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    avgLatencyMs: number | null;
  }>;
  bySource: Array<{
    source: string;
    apiKeyName: string | null;
    requests: number;
    promptTokens: number;
    completionTokens: number;
  }>;
  byTool: Array<{
    name: string;
    calls: number;
    requests: number;
  }>;
}

export async function getUsageSummary(window: UsageWindow): Promise<UsageSummary> {
  const interval = windowInterval(window);
  const bucket = bucketSize(window);
  // generate_series wants a step matching the bucket size.
  const step = bucket === 'hour' ? '1 hour' : '1 day';

  const [totalsRes, seriesRes, modelRes, sourceRes, toolRes] = await Promise.all([
    pool.query<{
      requests: string;
      success_requests: string;
      error_requests: string;
      prompt_tokens: string | null;
      completion_tokens: string | null;
      avg_latency_ms: string | null;
      p50_latency_ms: string | null;
      p99_latency_ms: string | null;
      tool_offered_requests: string;
      tool_calls: string;
    }>(
      `SELECT
          COUNT(*)::text                                                    AS requests,
          COUNT(*) FILTER (WHERE status = 'success')::text                  AS success_requests,
          COUNT(*) FILTER (WHERE status = 'error')::text                    AS error_requests,
          COALESCE(SUM(prompt_tokens), 0)::text                             AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0)::text                         AS completion_tokens,
          AVG(latency_ms)::text                                             AS avg_latency_ms,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::text     AS p50_latency_ms,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::text    AS p99_latency_ms,
          COUNT(*) FILTER (WHERE had_tools)::text                           AS tool_offered_requests,
          COALESCE(SUM(tool_calls_count), 0)::text                          AS tool_calls
       FROM request_log
       WHERE created_at >= NOW() - INTERVAL '${interval}'`
    ),
    // Generate a continuous bucket axis so the chart shows a proper timeline
    // even when activity is sparse — empty buckets render as zero-height bars.
    pool.query<{
      bucket: string;
      requests: string;
      prompt_tokens: string | null;
      completion_tokens: string | null;
      error_count: string;
    }>(
      `WITH buckets AS (
         SELECT generate_series(
           DATE_TRUNC('${bucket}', NOW() - INTERVAL '${interval}'),
           DATE_TRUNC('${bucket}', NOW()),
           INTERVAL '${step}'
         ) AS bucket
       )
       SELECT
          b.bucket                                                        AS bucket,
          COUNT(rl.id)::text                                              AS requests,
          COALESCE(SUM(rl.prompt_tokens), 0)::text                        AS prompt_tokens,
          COALESCE(SUM(rl.completion_tokens), 0)::text                    AS completion_tokens,
          COUNT(*) FILTER (WHERE rl.status = 'error')::text               AS error_count
       FROM buckets b
       LEFT JOIN request_log rl
              ON DATE_TRUNC('${bucket}', rl.created_at) = b.bucket
             AND rl.created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY b.bucket
       ORDER BY b.bucket ASC`
    ),
    pool.query<{
      model: string | null;
      requests: string;
      prompt_tokens: string | null;
      completion_tokens: string | null;
      avg_latency_ms: string | null;
    }>(
      `SELECT
          model,
          COUNT(*)::text                                      AS requests,
          COALESCE(SUM(prompt_tokens), 0)::text               AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0)::text           AS completion_tokens,
          AVG(latency_ms)::text                               AS avg_latency_ms
       FROM request_log
       WHERE created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY model
       ORDER BY requests DESC`
    ),
    pool.query<{
      source: string;
      api_key_name: string | null;
      requests: string;
      prompt_tokens: string | null;
      completion_tokens: string | null;
    }>(
      `SELECT
          r.source,
          ak.name AS api_key_name,
          COUNT(*)::text                                      AS requests,
          COALESCE(SUM(r.prompt_tokens), 0)::text             AS prompt_tokens,
          COALESCE(SUM(r.completion_tokens), 0)::text         AS completion_tokens
       FROM request_log r
       LEFT JOIN api_keys ak ON r.api_key_id = ak.id
       WHERE r.created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY r.source, ak.name
       ORDER BY requests DESC`
    ),
    // Tool-name histogram from the JSONB tools_used array.
    pool.query<{
      name: string;
      calls: string;
      requests: string;
    }>(
      `SELECT
          (t->>'name')                  AS name,
          SUM((t->>'count')::int)::text AS calls,
          COUNT(DISTINCT rl.id)::text   AS requests
       FROM request_log rl,
            LATERAL jsonb_array_elements(COALESCE(rl.tools_used, '[]'::jsonb)) AS t
       WHERE rl.created_at >= NOW() - INTERVAL '${interval}'
         AND rl.tools_used IS NOT NULL
       GROUP BY name
       ORDER BY calls DESC
       LIMIT 50`
    ),
  ]);

  const t = totalsRes.rows[0];
  const num = (v: string | null) => (v === null || v === undefined ? 0 : Number(v));
  const numOrNull = (v: string | null) => (v === null || v === undefined ? null : Number(v));

  return {
    window,
    totals: {
      requests: num(t?.requests ?? '0'),
      successRequests: num(t?.success_requests ?? '0'),
      errorRequests: num(t?.error_requests ?? '0'),
      promptTokens: num(t?.prompt_tokens ?? '0'),
      completionTokens: num(t?.completion_tokens ?? '0'),
      totalTokens: num(t?.prompt_tokens ?? '0') + num(t?.completion_tokens ?? '0'),
      avgLatencyMs: numOrNull(t?.avg_latency_ms ?? null),
      p50LatencyMs: numOrNull(t?.p50_latency_ms ?? null),
      p99LatencyMs: numOrNull(t?.p99_latency_ms ?? null),
      toolOfferedRequests: num(t?.tool_offered_requests ?? '0'),
      toolCalls: num(t?.tool_calls ?? '0'),
    },
    timeSeries: seriesRes.rows.map((r) => ({
      bucket: r.bucket,
      requests: num(r.requests),
      promptTokens: num(r.prompt_tokens),
      completionTokens: num(r.completion_tokens),
      errorCount: num(r.error_count),
    })),
    byModel: modelRes.rows.map((r) => ({
      model: r.model ?? 'unknown',
      requests: num(r.requests),
      promptTokens: num(r.prompt_tokens),
      completionTokens: num(r.completion_tokens),
      avgLatencyMs: numOrNull(r.avg_latency_ms),
    })),
    bySource: sourceRes.rows.map((r) => ({
      source: r.source,
      apiKeyName: r.api_key_name,
      requests: num(r.requests),
      promptTokens: num(r.prompt_tokens),
      completionTokens: num(r.completion_tokens),
    })),
    byTool: toolRes.rows.map((r) => ({
      name: r.name,
      calls: num(r.calls),
      requests: num(r.requests),
    })),
  };
}
