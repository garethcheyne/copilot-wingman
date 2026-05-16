import { pool } from '../db/client.js';

export type UsageWindow = '24h' | '7d' | '30d';

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
}

export async function logRequest(input: LogRequestInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO request_log
         (session_id, api_key_id, source, model, prompt_tokens, completion_tokens, latency_ms, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
}

export async function getUsageSummary(window: UsageWindow): Promise<UsageSummary> {
  const interval = windowInterval(window);
  const bucket = bucketSize(window);

  const [totalsRes, seriesRes, modelRes, sourceRes] = await Promise.all([
    pool.query<{
      requests: string;
      success_requests: string;
      error_requests: string;
      prompt_tokens: string | null;
      completion_tokens: string | null;
      avg_latency_ms: string | null;
      p50_latency_ms: string | null;
      p99_latency_ms: string | null;
    }>(
      `SELECT
          COUNT(*)::text                                                    AS requests,
          COUNT(*) FILTER (WHERE status = 'success')::text                  AS success_requests,
          COUNT(*) FILTER (WHERE status = 'error')::text                    AS error_requests,
          COALESCE(SUM(prompt_tokens), 0)::text                             AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0)::text                         AS completion_tokens,
          AVG(latency_ms)::text                                             AS avg_latency_ms,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::text     AS p50_latency_ms,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::text    AS p99_latency_ms
       FROM request_log
       WHERE created_at >= NOW() - INTERVAL '${interval}'`
    ),
    pool.query<{
      bucket: string;
      requests: string;
      prompt_tokens: string | null;
      completion_tokens: string | null;
      error_count: string;
    }>(
      `SELECT
          DATE_TRUNC('${bucket}', created_at) AS bucket,
          COUNT(*)::text                                          AS requests,
          COALESCE(SUM(prompt_tokens), 0)::text                   AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0)::text               AS completion_tokens,
          COUNT(*) FILTER (WHERE status = 'error')::text          AS error_count
       FROM request_log
       WHERE created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY bucket
       ORDER BY bucket ASC`
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
  };
}
