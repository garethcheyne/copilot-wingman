/**
 * Model Sync Service
 *
 * Periodically fetches the upstream model catalog from GitHub Copilot,
 * compares with what we have stored in the DB, and records changes:
 *   - New models added → status 'active', event 'added'
 *   - Models no longer upstream → status 'removed', event 'removed'
 *   - Models that reappear → status 'active', event 'restored'
 *   - Capability or endpoint changes → event 'capabilities_changed' / 'endpoints_changed'
 *
 * The DB is the source of truth for the rest of the app (routes, UI, tests).
 */

import { pool } from '../db/client.js';
import { getCopilotToken } from './copilot-token.js';
import { hasLlmStatsKey, loadLlmStatsKey, fetchEnrichmentMap, llmStatsIdCandidates } from './llm-stats.js';
import type { ModelEnrichment } from './llm-stats.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface UpstreamModel {
  id: string;
  name: string;
  vendor: string;
  version: string;
  preview: boolean;
  model_picker_category?: string;
  model_picker_enabled?: boolean;
  supported_endpoints?: string[];
  capabilities?: {
    family: string;
    type: string;
    tokenizer?: string;
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
      max_prompt_tokens?: number;
    };
    supports?: {
      streaming?: boolean;
      tool_calls?: boolean;
      vision?: boolean;
      structured_outputs?: boolean;
      adaptive_thinking?: boolean;
      parallel_tool_calls?: boolean;
    };
  };
}

export interface StoredModel {
  id: string;
  name: string;
  vendor: string;
  version: string;
  preview: boolean;
  category: string | null;
  supported_endpoints: string[];
  chat_enabled: boolean;
  capabilities: any;
  description: string | null;
  best_for: string | null;
  premium_multiplier: number | null;
  retirement_date: string | null;
  organization: string | null;
  model_type: string | null;
  modalities: string[];
  license: string | null;
  open_weight: boolean;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  release_date: string | null;
  context_window: number | null;
  param_count: number | null;
  status: 'active' | 'removed' | 'revoked';
  first_seen_at: Date;
  last_seen_at: Date;
  removed_at: Date | null;
}

export interface SyncEvent {
  id: string;
  model_id: string;
  event: 'added' | 'removed' | 'restored' | 'capabilities_changed' | 'endpoints_changed';
  old_value: any;
  new_value: any;
  created_at: Date;
}

export interface SyncResult {
  added: string[];
  removed: string[];
  restored: string[];
  changed: string[];
  unchanged: number;
  total_upstream: number;
  total_active: number;
  synced_at: Date;
}

// ─── Upstream Fetch ─────────────────────────────────────────────────────────────

async function fetchUpstreamModels(): Promise<UpstreamModel[]> {
  const token = await getCopilotToken();
  const res = await fetch('https://api.githubcopilot.com/models', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'GithubCopilot/1.300.0',
      'Copilot-Integration-Id': 'vscode-chat',
      'Editor-Version': 'vscode/1.100.0',
      'Editor-Plugin-Version': 'copilot-chat/0.28.0',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Upstream models API returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { data: UpstreamModel[] };
  return body.data;
}

// ─── Model Metadata (from GitHub Docs — no public API for this) ─────────────────
// Source: https://docs.github.com/en/copilot/reference/ai-models/model-comparison
//         https://docs.github.com/en/copilot/reference/ai-models/supported-models

interface ModelMeta {
  description: string;
  best_for: string;
  premium_multiplier: number;
  retirement_date?: string;  // ISO date if closing down
}

const MODEL_META: Record<string, ModelMeta> = {
  'gpt-4.1':           { description: 'General-purpose coding and writing model.', best_for: 'Fast, accurate code completions and explanations', premium_multiplier: 0, retirement_date: '2026-06-01' },
  'gpt-4o':            { description: 'Legacy general-purpose model.', best_for: 'Basic coding and writing tasks', premium_multiplier: 0 },
  'gpt-5-mini':        { description: 'Reliable default for most coding and writing tasks. Supports multimodal input for visual reasoning.', best_for: 'General-purpose coding, deep reasoning, visual tasks', premium_multiplier: 0 },
  'gpt-5.2':           { description: 'Multi-step problem solving and architecture-level code analysis.', best_for: 'Deep reasoning and debugging', premium_multiplier: 1, retirement_date: '2026-06-01' },
  'gpt-5.2-codex':     { description: 'Agentic software development model. Only supports /responses endpoint.', best_for: 'Agentic tasks', premium_multiplier: 1, retirement_date: '2026-06-01' },
  'gpt-5.3-codex':     { description: 'Higher-quality code on complex engineering tasks like features, tests, debugging, refactors, and reviews.', best_for: 'Agentic software development', premium_multiplier: 1 },
  'gpt-5.4':           { description: 'Multi-step problem solving and architecture-level code analysis.', best_for: 'Deep reasoning and debugging', premium_multiplier: 1 },
  'gpt-5.4-mini':      { description: 'Codebase exploration, especially effective with grep-style tools.', best_for: 'Agentic software development', premium_multiplier: 0.33 },
  'gpt-5.5':           { description: 'Great at complex reasoning, code analysis, and technical decision-making.', best_for: 'Deep reasoning and debugging', premium_multiplier: 7.5 },
  'claude-haiku-4.5':  { description: 'Balances fast responses with quality output.', best_for: 'Fast help with simple or repetitive tasks', premium_multiplier: 0.33 },
  'claude-opus-4.5':   { description: 'Complex problem-solving challenges and sophisticated reasoning.', best_for: 'Deep reasoning and debugging', premium_multiplier: 3 },
  'claude-opus-4.6':   { description: 'Complex problem-solving challenges and sophisticated reasoning.', best_for: 'Deep reasoning and debugging', premium_multiplier: 3 },
  'claude-opus-4.7':   { description: 'Anthropic\'s most powerful model. Improves on Claude Opus 4.6.', best_for: 'Deep reasoning and debugging', premium_multiplier: 15 },
  'claude-sonnet-4.5': { description: 'Complex problem-solving challenges, sophisticated reasoning.', best_for: 'General-purpose coding and agent tasks', premium_multiplier: 1 },
  'claude-sonnet-4.6': { description: 'Improves on Sonnet 4.5 with more reliable completions and smarter reasoning.', best_for: 'General-purpose coding, agent tasks, visual tasks', premium_multiplier: 1 },
  'gemini-2.5-pro':    { description: 'Complex code generation, debugging, and research workflows.', best_for: 'Deep reasoning and debugging', premium_multiplier: 1 },
  'gemini-3-flash-preview': { description: 'Fast, reliable answers to lightweight coding questions.', best_for: 'Fast help with simple or repetitive tasks', premium_multiplier: 0.33 },
  'gemini-3.1-pro':    { description: 'Effective and efficient edit-then-test loops with high tool precision.', best_for: 'Deep reasoning and debugging', premium_multiplier: 1 },
};

function getModelMeta(id: string): ModelMeta | null {
  return MODEL_META[id] ?? null;
}

// ─── DB Operations ──────────────────────────────────────────────────────────────

function chatEnabledFromEndpoints(endpoints: string[]): boolean {
  return endpoints.length === 0 || endpoints.includes('/chat/completions');
}

/** Stable JSON string (sorted keys) for deep comparison */
function stableJson(obj: unknown): string {
  return JSON.stringify(obj, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v).sort().reduce<Record<string, unknown>>((o, k) => { o[k] = (v as Record<string, unknown>)[k]; return o; }, {})
      : v,
  );
}

function capabilitiesJson(m: UpstreamModel): any {
  if (!m.capabilities) return null;
  return {
    type: m.capabilities.type,
    family: m.capabilities.family,
    tokenizer: m.capabilities.tokenizer ?? null,
    context_window: m.capabilities.limits?.max_context_window_tokens ?? null,
    max_output_tokens: m.capabilities.limits?.max_output_tokens ?? null,
    max_prompt_tokens: m.capabilities.limits?.max_prompt_tokens ?? null,
    supports: {
      streaming: m.capabilities.supports?.streaming ?? false,
      tool_calls: m.capabilities.supports?.tool_calls ?? false,
      vision: m.capabilities.supports?.vision ?? false,
      structured_outputs: m.capabilities.supports?.structured_outputs ?? false,
      thinking: m.capabilities.supports?.adaptive_thinking ?? false,
      parallel_tool_calls: m.capabilities.supports?.parallel_tool_calls ?? false,
    },
  };
}

async function logEvent(
  modelId: string,
  event: SyncEvent['event'],
  oldValue: any,
  newValue: any,
): Promise<void> {
  await pool.query(
    `INSERT INTO model_sync_log (model_id, event, old_value, new_value)
     VALUES ($1, $2, $3, $4)`,
    [modelId, event, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null],
  );
}

// ─── Sync Logic ─────────────────────────────────────────────────────────────────

/**
 * Look up LLM Stats enrichment for a Copilot model ID.
 * Tries exact ID first, then dots→dashes fallback.
 */
function lookupEnrichment(
  map: Map<string, ModelEnrichment> | null,
  modelId: string,
): ModelEnrichment | null {
  if (!map) return null;
  for (const candidate of llmStatsIdCandidates(modelId)) {
    const hit = map.get(candidate);
    if (hit) return hit;
  }
  return null;
}

/**
 * Perform a full sync: fetch upstream, compare with DB, upsert/remove/log.
 */
export async function syncModels(): Promise<SyncResult> {
  const upstream = await fetchUpstreamModels();
  const upstreamIds = new Set(upstream.map(m => m.id));

  // Load all existing models from DB
  const existing = await pool.query(`SELECT * FROM upstream_models`);
  const existingMap = new Map<string, any>(existing.rows.map(r => [r.id, r]));

  // Optionally fetch LLM Stats enrichment (only if user has configured an API key)
  let enrichmentMap: Map<string, ModelEnrichment> | null = null;
  try {
    if (await hasLlmStatsKey()) {
      const apiKey = await loadLlmStatsKey();
      if (apiKey) {
        enrichmentMap = await fetchEnrichmentMap(apiKey);
        console.log(`[model-sync] LLM Stats enrichment loaded (${enrichmentMap.size} models)`);
      }
    }
  } catch (err) {
    console.warn('[model-sync] LLM Stats enrichment failed, continuing without:', (err as Error).message);
  }

  const result: SyncResult = {
    added: [],
    removed: [],
    restored: [],
    changed: [],
    unchanged: 0,
    total_upstream: upstream.length,
    total_active: 0,
    synced_at: new Date(),
  };

  // Process upstream models
  for (const m of upstream) {
    const endpoints = m.supported_endpoints ?? [];
    const chatEnabled = chatEnabledFromEndpoints(endpoints);
    const caps = capabilitiesJson(m);
    const category = m.model_picker_category ?? null;

    // Lookup LLM Stats enrichment using ID candidates
    const enrichment = lookupEnrichment(enrichmentMap, m.id);

    const existingRow = existingMap.get(m.id);

    if (!existingRow) {
      // Brand new model — enrich with curated metadata + LLM Stats
      const meta = getModelMeta(m.id);
      await pool.query(
        `INSERT INTO upstream_models (id, name, vendor, version, preview, category, supported_endpoints, chat_enabled, capabilities,
         description, best_for, premium_multiplier, retirement_date,
         organization, model_type, modalities, license, open_weight, input_price_per_m, output_price_per_m,
         release_date, context_window, param_count, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, 'active')`,
        [m.id, m.name, m.vendor, m.version, m.preview, category, endpoints, chatEnabled,
         caps ? JSON.stringify(caps) : null,
         meta?.description ?? enrichment?.description ?? null,
         meta?.best_for ?? null,
         meta?.premium_multiplier ?? null,
         meta?.retirement_date ?? null,
         enrichment?.organization ?? null,
         enrichment?.model_type ?? null,
         enrichment?.modalities ?? [],
         enrichment?.license ?? null,
         enrichment?.open_weight ?? false,
         enrichment?.input_price_per_m ?? null,
         enrichment?.output_price_per_m ?? null,
         enrichment?.release_date ?? null,
         enrichment?.context_window ?? null,
         enrichment?.param_count ?? null],
      );
      await logEvent(m.id, 'added', null, { name: m.name, vendor: m.vendor, category, chat_enabled: chatEnabled, endpoints });
      result.added.push(m.id);
      console.log(`[model-sync] ✚ New model: ${m.id} (${m.vendor}, chat=${chatEnabled})`);
    } else {
      // Existing model — check for changes
      let changed = false;

      // Check endpoint changes
      const oldEndpoints: string[] = existingRow.supported_endpoints ?? [];
      const endpointsChanged =
        stableJson([...oldEndpoints].sort()) !== stableJson([...endpoints].sort());
      if (endpointsChanged) {
        await logEvent(m.id, 'endpoints_changed', { endpoints: oldEndpoints }, { endpoints });
        result.changed.push(m.id);
        changed = true;
        console.log(`[model-sync] ↻ Endpoints changed: ${m.id} [${oldEndpoints.join(',')}] → [${endpoints.join(',')}]`);
      }

      // Check capability changes (deep compare with sorted keys)
      const oldCaps = existingRow.capabilities;
      const capsChanged = stableJson(oldCaps) !== stableJson(caps);
      if (capsChanged && !endpointsChanged) {
        await logEvent(m.id, 'capabilities_changed', oldCaps, caps);
        if (!result.changed.includes(m.id)) result.changed.push(m.id);
        changed = true;
        console.log(`[model-sync] ↻ Capabilities changed: ${m.id}`);
      }

      // Was it previously removed? Restore it
      if (existingRow.status === 'removed') {
        await logEvent(m.id, 'restored', { status: 'removed' }, { status: 'active' });
        result.restored.push(m.id);
        changed = true;
        console.log(`[model-sync] ↺ Restored: ${m.id}`);
      }

      // Update the row (also refresh enrichment data in case we updated the map)
      const meta = getModelMeta(m.id);
      await pool.query(
        `UPDATE upstream_models SET
            name = $2, vendor = $3, version = $4, preview = $5,
            category = $6, supported_endpoints = $7, chat_enabled = $8,
            capabilities = $9, status = 'active', last_seen_at = NOW(),
            removed_at = NULL, updated_at = NOW(),
            description = COALESCE($10, description),
            best_for = COALESCE($11, best_for),
            premium_multiplier = COALESCE($12, premium_multiplier),
            retirement_date = COALESCE($13, retirement_date),
            organization = COALESCE($14, organization),
            model_type = COALESCE($15, model_type),
            modalities = CASE WHEN $16::text[] = '{}' THEN modalities ELSE $16 END,
            license = COALESCE($17, license),
            open_weight = COALESCE($18, open_weight),
            input_price_per_m = COALESCE($19, input_price_per_m),
            output_price_per_m = COALESCE($20, output_price_per_m),
            release_date = COALESCE($21, release_date),
            context_window = COALESCE($22, context_window),
            param_count = COALESCE($23, param_count)
         WHERE id = $1`,
        [m.id, m.name, m.vendor, m.version, m.preview, category, endpoints, chatEnabled,
         caps ? JSON.stringify(caps) : null,
         meta?.description ?? enrichment?.description ?? null,
         meta?.best_for ?? null,
         meta?.premium_multiplier ?? null,
         meta?.retirement_date ?? null,
         enrichment?.organization ?? null,
         enrichment?.model_type ?? null,
         enrichment?.modalities ?? [],
         enrichment?.license ?? null,
         enrichment?.open_weight ?? null,
         enrichment?.input_price_per_m ?? null,
         enrichment?.output_price_per_m ?? null,
         enrichment?.release_date ?? null,
         enrichment?.context_window ?? null,
         enrichment?.param_count ?? null],
      );

      if (!changed) result.unchanged++;
    }
  }

  // Detect removed models (in DB but not in upstream)
  for (const [id, row] of existingMap) {
    if (row.status === 'active' && !upstreamIds.has(id)) {
      await pool.query(
        `UPDATE upstream_models SET status = 'removed', removed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id],
      );
      await logEvent(id, 'removed', { status: 'active' }, { status: 'removed' });
      result.removed.push(id);
      console.log(`[model-sync] ✗ Removed: ${id} (no longer in upstream)`);
    }
  }

  result.total_active = upstream.length + existingMap.size - result.removed.length;
  // Actually count from what's active now
  const activeCount = await pool.query(`SELECT COUNT(*) as c FROM upstream_models WHERE status = 'active'`);
  result.total_active = parseInt(activeCount.rows[0].c, 10);

  // Store last sync time
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('last_model_sync', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [result.synced_at.toISOString()],
  );

  const summary = [];
  if (result.added.length) summary.push(`+${result.added.length} new`);
  if (result.removed.length) summary.push(`-${result.removed.length} removed`);
  if (result.restored.length) summary.push(`↺${result.restored.length} restored`);
  if (result.changed.length) summary.push(`↻${result.changed.length} changed`);
  summary.push(`${result.unchanged} unchanged`);
  console.log(`[model-sync] Sync complete: ${summary.join(', ')} (${result.total_active} active)`);

  return result;
}

// ─── Queries ────────────────────────────────────────────────────────────────────

/** Get all active models from the DB */
export async function getActiveModels(): Promise<StoredModel[]> {
  const res = await pool.query(
    `SELECT * FROM upstream_models WHERE status = 'active' ORDER BY vendor, name`,
  );
  return res.rows;
}

/** Get models filtered by a list of model IDs (for API key scopes) */
export async function getModelsByIds(ids: string[]): Promise<StoredModel[]> {
  if (ids.length === 0) return [];
  const res = await pool.query(
    `SELECT * FROM upstream_models WHERE id = ANY($1) AND status = 'active' ORDER BY vendor, name`,
    [ids],
  );
  return res.rows;
}

/** Get a single model */
export async function getModelById(id: string): Promise<StoredModel | null> {
  const res = await pool.query(`SELECT * FROM upstream_models WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

/** Get recent sync events */
export async function getSyncEvents(limit = 50): Promise<SyncEvent[]> {
  const res = await pool.query(
    `SELECT * FROM model_sync_log ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows;
}

/** Get last sync timestamp */
export async function getLastSyncTime(): Promise<Date | null> {
  const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'last_model_sync'`);
  return res.rows[0] ? new Date(res.rows[0].value) : null;
}

/** Check if the models table has any data (first run check) */
async function hasModels(): Promise<boolean> {
  const res = await pool.query(`SELECT EXISTS(SELECT 1 FROM upstream_models) AS has`);
  return res.rows[0].has;
}

/** Validate that an array of model IDs still exist as active models */
export async function validateModelIds(ids: string[]): Promise<{ valid: string[]; invalid: string[] }> {
  if (ids.length === 0) return { valid: [], invalid: [] };
  const res = await pool.query(
    `SELECT id FROM upstream_models WHERE id = ANY($1) AND status = 'active'`,
    [ids],
  );
  const activeSet = new Set(res.rows.map(r => r.id));
  return {
    valid: ids.filter(id => activeSet.has(id)),
    invalid: ids.filter(id => !activeSet.has(id)),
  };
}

// ─── Background Sync ───────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = parseInt(process.env.MODEL_SYNC_INTERVAL_MS ?? '300000', 10); // default 5min
let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic model sync. Does an initial sync immediately,
 * then repeats on the configured interval.
 */
export async function startModelSync(): Promise<void> {
  console.log(`[model-sync] Starting (interval: ${SYNC_INTERVAL_MS / 1000}s)`);

  // Initial sync
  try {
    await syncModels();
  } catch (err) {
    console.error('[model-sync] Initial sync failed:', (err as Error).message);
  }

  // Periodic
  syncTimer = setInterval(async () => {
    try {
      await syncModels();
    } catch (err) {
      console.error('[model-sync] Periodic sync failed:', (err as Error).message);
    }
  }, SYNC_INTERVAL_MS);
}

/** Stop the background sync timer */
function stopModelSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[model-sync] Stopped');
  }
}
