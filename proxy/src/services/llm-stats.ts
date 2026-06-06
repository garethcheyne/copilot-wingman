/**
 * LLM Stats API client — fetches model metadata, benchmark scores, and pricing
 * from llm-stats.com to enrich the local model catalog.
 *
 * API reference: /resources/openapi-llmstatus.json
 * Base URL: https://llm-stats.com/stats
 * Auth: Bearer token (stored encrypted in app_settings.llm_stats_api_key)
 */

import { pool } from '../db/client.js';
import { decrypt } from './crypto.js';

const BASE_URL = 'https://api.zeroeval.com/stats';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';

// ─── Types ──────────────────────────────────────────

export interface LlmStatsModel {
  id: string;
  name: string;
  description: string;
  organization: { id: string; name: string };
  family: { id: string; name: string } | null;
  license: { id: string; name: string; allow_commercial: boolean } | null;
  open_weight: boolean;
  model_type: string;
  modalities: string[];
  context_window: number | null;
  param_count: number | null;
  release_date: string | null;
  providers: ModelProvider[];
  top_scores: Record<string, number>;
  created_at: string;
  updated_at: string;
  source: string;
  url: string;
}

export interface ModelProvider {
  provider_id: string;
  provider_name: string;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  status: string;
}

export interface LlmStatsModelDetail extends LlmStatsModel {
  scores: BenchmarkScore[];
  sources: LlmStatsSources;
}

export interface BenchmarkScore {
  benchmark_id: string;
  benchmark_name: string;
  category: string | null;
  description: string | null;
  score: number;
  normalized_score: number | null;
  max_score: number;
  is_self_reported: boolean;
  verified_by_llmstats: boolean;
  rank: number | null;
  source_url: string | null;
  scored_at: string;
}

export interface LlmStatsSources {
  api_ref: string | null;
  paper: string | null;
  weights: string | null;
  repo: string | null;
}

interface RankedModel {
  rank: number;
  model_id: string;
  model_name: string;
  organization: string;
  score: number;
  conservative_rating: number;
  open_weight: boolean;
  min_input_price: number | null;
  benchmarks_evaluated: number;
}

// ─── Key Management ─────────────────────────────────

/**
 * Load the decrypted LLM Stats API key from DB.
 * Returns null if no key is configured.
 */
export async function loadLlmStatsKey(): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'llm_stats_api_key'`
    );
    if (result.rows.length === 0) return null;

    const buf = Buffer.from(result.rows[0].value, 'base64');
    return decrypt(buf, ENCRYPTION_KEY);
  } catch {
    return null;
  }
}

/**
 * Check whether an LLM Stats API key is configured.
 */
export async function hasLlmStatsKey(): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM app_settings WHERE key = 'llm_stats_api_key'`
  );
  return result.rows.length > 0;
}

// ─── API Calls ──────────────────────────────────────

async function llmStatsFetch<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[llm-stats] ${path} returned ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[llm-stats] fetch error for ${path}:`, (err as Error).message);
    return null;
  }
}

/**
 * List models from LLM Stats. Returns up to `limit` models.
 */
async function listModels(
  apiKey: string,
  opts?: { organization?: string; limit?: number }
): Promise<LlmStatsModel[]> {
  const params = new URLSearchParams();
  if (opts?.organization) params.set('organization', opts.organization);
  params.set('limit', String(opts?.limit ?? 200));

  const data = await llmStatsFetch<{ models: LlmStatsModel[]; total: number }>(
    `/v1/models?${params}`,
    apiKey
  );
  return data?.models ?? [];
}

/**
 * Generate candidate IDs for matching a Copilot model ID to an LLM Stats ID.
 * Copilot uses dots in some IDs (claude-sonnet-4.6) while LLM Stats uses
 * dashes for Claude (claude-sonnet-4-6) but keeps dots for GPT (gpt-5.4-mini).
 */
export function llmStatsIdCandidates(modelId: string): string[] {
  const candidates = [modelId];
  // dots → dashes (claude-opus-4.6 → claude-opus-4-6)
  const dashed = modelId.replace(/\./g, '-');
  if (dashed !== modelId) candidates.push(dashed);
  return candidates;
}

/**
 * Get detailed info for a single model by ID, including benchmark scores.
 * Tries the exact ID first, then falls back to normalized variants.
 */
export async function getModelDetail(
  apiKey: string,
  modelId: string
): Promise<LlmStatsModelDetail | null> {
  for (const candidate of llmStatsIdCandidates(modelId)) {
    const result = await llmStatsFetch<LlmStatsModelDetail>(`/v1/models/${encodeURIComponent(candidate)}`, apiKey);
    if (result) return result;
  }
  return null;
}

/**
 * Get rankings for a category (e.g. "coding", "math", "reasoning").
 */
async function getRankings(
  apiKey: string,
  category: string,
  limit = 20
): Promise<RankedModel[]> {
  const data = await llmStatsFetch<{ category: string; models: RankedModel[] }>(
    `/v1/rankings?category=${encodeURIComponent(category)}&limit=${limit}`,
    apiKey
  );
  return data?.models ?? [];
}

// ─── Enrichment ─────────────────────────────────────

/**
 * Enrichment data extracted from LLM Stats for a single model.
 * Used by model-sync.ts to supplement the curated MODEL_META map.
 */
export interface ModelEnrichment {
  description: string | null;
  context_window: number | null;
  param_count: number | null;
  release_date: string | null;
  top_scores: Record<string, number>;
  organization: string | null;
  model_type: string | null;
  modalities: string[];
  license: string | null;
  open_weight: boolean;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
}

/**
 * Build a model-ID → enrichment map by fetching all models from LLM Stats.
 * This is called during model sync to augment our curated metadata.
 *
 * We match by normalized model name since LLM Stats IDs won't exactly match
 * GitHub Copilot model IDs (e.g. "claude-sonnet-4" vs "claude-3.5-sonnet").
 */
export async function fetchEnrichmentMap(
  apiKey: string
): Promise<Map<string, ModelEnrichment>> {
  const models = await listModels(apiKey, { limit: 200 });
  const map = new Map<string, ModelEnrichment>();

  for (const m of models) {
    // Find first active provider for pricing
    const activeProvider = m.providers?.find(p => p.status === 'active') ?? m.providers?.[0] ?? null;

    const enrichment: ModelEnrichment = {
      description: m.description || null,
      context_window: m.context_window,
      param_count: m.param_count,
      release_date: m.release_date,
      top_scores: m.top_scores ?? {},
      organization: m.organization?.name ?? null,
      model_type: m.model_type ?? null,
      modalities: m.modalities ?? [],
      license: m.license?.name ?? null,
      open_weight: m.open_weight ?? false,
      input_price_per_m: activeProvider?.input_price_per_m ?? null,
      output_price_per_m: activeProvider?.output_price_per_m ?? null,
    };

    // Store under the LLM Stats ID
    map.set(m.id, enrichment);

    // Also store under the model name (lowercase, for fuzzy matching)
    const normalizedName = m.name.toLowerCase().replace(/\s+/g, '-');
    if (normalizedName !== m.id) {
      map.set(normalizedName, enrichment);
    }
  }

  return map;
}
