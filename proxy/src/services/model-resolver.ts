import { pool } from '../db/client.js';

/**
 * Model resolver — transparently reroutes requests for retired / unknown
 * models to the newest active model in the same family.
 *
 *   claude-opus-4.6       → claude-opus-5.5        (same vendor + tier)
 *   claude-opus-4.8-fast  → newest claude-opus-*-fast
 *   gpt-5.5               → newest gpt-* (no tier) newer than 5.5, if any
 *
 * Rules:
 *   - Active models are never rerouted.
 *   - Only upgrades: the replacement's version must be >= the requested one.
 *   - Family = id with the version token removed (and trailing date tokens
 *     dropped), so tier/suffix must match exactly (opus ≠ sonnet, -fast ≠ plain).
 *   - Non-preview models preferred; then highest version.
 *   - If `requireChat` is set, only models serving /chat/completions qualify.
 *   - Explicit overrides can be stored in app_settings key `model_aliases`
 *     as JSON: {"old-model-id": "new-model-id"}. These win over auto-matching.
 *   - Disable entirely with env MODEL_AUTO_REROUTE=false.
 */

interface ActiveModel {
  id: string;
  preview: boolean;
  supported_endpoints: string[];
}

interface ParsedId {
  family: string;
  version: number[] | null;
}

export interface ResolvedModel {
  model: string;
  requested: string;
  rerouted: boolean;
  /** Caller asked for a model we know upstream has retired. */
  retired: boolean;
  reason?: 'alias' | 'retired' | 'unknown' | 'latest';
}

export interface ModelUpgradeNotice {
  name: string;
  requested: string;
  message: string;
}

/** Payload returned to callers whose request was rerouted (`model_upgrade`). */
export function buildUpgradeNotice(r: ResolvedModel): ModelUpgradeNotice | null {
  if (!r.rerouted || r.reason === 'latest') return null; // -latest is intentional, no nag
  const why = r.retired ? 'has been retired' : 'is not available';
  return {
    name: r.model,
    requested: r.requested,
    message:
      `The model '${r.requested}' you requested ${why} and has been upgraded to '${r.model}'. ` +
      `Please update your integration to use '${r.model}'. Wingman will keep redirecting '${r.requested}' for you in the meantime.`,
  };
}

const CACHE_TTL = 60_000;
let cache: { at: number; active: Map<string, ActiveModel>; known: Set<string>; aliases: Record<string, string> } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache;

  const [models, settings] = await Promise.all([
    pool.query(`SELECT id, status, preview, supported_endpoints FROM upstream_models`),
    pool.query(`SELECT value FROM app_settings WHERE key = 'model_aliases'`).catch(() => ({ rows: [] as { value: string }[] })),
  ]);

  const active = new Map<string, ActiveModel>();
  const known = new Set<string>();
  for (const r of models.rows) {
    known.add(r.id);
    if (r.status === 'active') {
      active.set(r.id, { id: r.id, preview: !!r.preview, supported_endpoints: r.supported_endpoints ?? [] });
    }
  }

  let aliases: Record<string, string> = {};
  const raw = settings.rows[0]?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') aliases = parsed;
    } catch {
      console.warn('[model-resolver] app_settings.model_aliases is not valid JSON — ignoring');
    }
  }

  cache = { at: Date.now(), active, known, aliases };
  return cache;
}

/** Force reload on next resolve (call after model sync or alias edits). */
export function invalidateModelResolverCache(): void {
  cache = null;
}

/** Split an id into family key + numeric version. Exported for tests. */
export function parseModelId(id: string): ParsedId {
  const tokens = id.toLowerCase().split('-');
  let version: number[] | null = null;
  const familyTokens: string[] = [];
  let inDate = false;
  for (const t of tokens) {
    if (/^\d{4}$/.test(t)) inDate = true; // 2024-11-20 style date suffix
    if (/^\d+$/.test(t) && inDate) continue;
    if (/^\d{1,2}(\.\d+)*$/.test(t)) {
      // First short numeric token is the version; later ones (dates) are dropped.
      if (!version) version = t.split('.').map(Number);
      continue;
    }
    if (/^\d+$/.test(t)) continue; // date components like 2024 / 05
    familyTokens.push(t);
  }
  return { family: familyTokens.join('-'), version };
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function servesChat(m: ActiveModel): boolean {
  return m.supported_endpoints.length === 0 || m.supported_endpoints.includes('/chat/completions');
}

/** Pick the best active replacement for `requested`. Exported for tests. */
export function pickReplacement(
  requested: string,
  candidates: Iterable<ActiveModel>,
  requireChat = false,
): string | null {
  const want = parseModelId(requested);
  if (!want.version || !want.family) return null;

  let best: { m: ActiveModel; v: number[] } | null = null;
  for (const m of candidates) {
    if (requireChat && !servesChat(m)) continue;
    const p = parseModelId(m.id);
    if (p.family !== want.family || !p.version) continue;
    if (compareVersions(p.version, want.version) < 0) continue; // never downgrade
    if (
      !best ||
      (best.m.preview && !m.preview) ||
      (best.m.preview === m.preview && compareVersions(p.version, best.v) > 0)
    ) {
      best = { m, v: p.version };
    }
  }
  return best?.m.id ?? null;
}

/**
 * Resolve a `<family>-latest` alias (e.g. `claude-sonnet-latest`) to the
 * newest active versioned model in that family. When `allowed` (API key
 * scopes) is non-empty, prefer the newest model the key may use. Exported for tests.
 */
export function pickLatest(
  requested: string,
  candidates: Iterable<ActiveModel>,
  requireChat = false,
  allowed: string[] = [],
): string | null {
  if (!requested.toLowerCase().endsWith('-latest')) return null;
  const family = requested.toLowerCase().slice(0, -'-latest'.length);
  const inFamily: { m: ActiveModel; v: number[] }[] = [];
  for (const m of candidates) {
    if (requireChat && !servesChat(m)) continue;
    const p = parseModelId(m.id);
    if (p.family === family && p.version) inFamily.push({ m, v: p.version });
  }
  const best = (list: typeof inFamily) =>
    list.reduce<(typeof inFamily)[number] | null>((b, x) => {
      if (!b) return x;
      if (b.m.preview !== x.m.preview) return b.m.preview ? x : b; // stable over preview
      const cmp = compareVersions(x.v, b.v);
      if (cmp === 0) return x.m.id.length < b.m.id.length ? x : b; // prefer base id over dated snapshot
      return cmp > 0 ? x : b;
    }, null)?.m.id ?? null;
  if (allowed.length > 0) {
    const scoped = best(inFamily.filter(x => allowed.includes(x.m.id)));
    if (scoped) return scoped;
  }
  return best(inFamily);
}

export async function resolveModel(
  requested: string,
  opts: { requireChat?: boolean; allowed?: string[] } = {},
): Promise<ResolvedModel> {
  const passthrough: ResolvedModel = { model: requested, requested, rerouted: false, retired: false };
  if (process.env.MODEL_AUTO_REROUTE === 'false') return passthrough;

  let c;
  try {
    c = await load();
  } catch (err) {
    console.error('[model-resolver] failed to load models, passing through:', (err as Error).message);
    return passthrough;
  }

  const isActive = c.active.has(requested);
  const retired = !isActive && c.known.has(requested);

  // Always-latest policy: any versioned id (claude-sonnet-5) or explicit
  // `<family>-latest` alias resolves to the newest active model in that
  // family — preferring models the API key may use, never below the
  // version asked for. Disable with MODEL_ALWAYS_LATEST=false.
  const isLatestAlias = requested.toLowerCase().endsWith('-latest');
  const parsed = parseModelId(requested);
  const alwaysLatest = process.env.MODEL_ALWAYS_LATEST !== 'false';
  if (isLatestAlias || (alwaysLatest && parsed.version && parsed.family)) {
    const fam = isLatestAlias ? requested : `${parsed.family}-latest`;
    const atLeastRequested = (id: string | null) => {
      if (!id || isLatestAlias || !parsed.version) return id;
      const v = parseModelId(id).version;
      return v && compareVersions(v, parsed.version) >= 0 ? id : null;
    };
    const latest =
      atLeastRequested(pickLatest(fam, c.active.values(), opts.requireChat, opts.allowed)) ??
      atLeastRequested(pickLatest(fam, c.active.values(), opts.requireChat));
    if (latest === requested) return passthrough;
    if (latest) {
      const reason = isActive || isLatestAlias ? 'latest' : retired ? 'retired' : 'unknown';
      console.log(`[model-resolver] ${requested} → ${latest} (${reason})`);
      return { model: latest, requested, rerouted: true, retired, reason };
    }
  }

  if (isActive) return passthrough;
  const unresolved: ResolvedModel = { ...passthrough, retired };

  const alias = c.aliases[requested];
  if (alias && c.active.has(alias)) {
    console.log(`[model-resolver] ${requested} → ${alias} (alias)`);
    return { model: alias, requested, rerouted: true, retired, reason: 'alias' };
  }

  const replacement = pickReplacement(requested, c.active.values(), opts.requireChat);
  if (replacement) {
    const reason = retired ? 'retired' : 'unknown';
    console.log(`[model-resolver] ${requested} → ${replacement} (${reason})`);
    return { model: replacement, requested, rerouted: true, retired, reason };
  }

  return unresolved;
}

/**
 * Keep API keys usable as models retire. Idempotent — runs after every sync.
 *
 *  - scopes: the successor is ADDED next to the retired id (never replaced),
 *    so a model that briefly vanishes upstream and comes back keeps working,
 *    and admins can still see what the key was originally scoped to.
 *  - default_model: replaced by the successor, but only once the model has
 *    been retired for DEFAULT_MODEL_GRACE_HOURS (request-time rerouting
 *    covers it in the meantime).
 * Ids with no successor are left untouched.
 */
const DEFAULT_MODEL_GRACE_HOURS = 24;

export async function upgradeApiKeyModels(): Promise<{ key: string; from: string; to: string }[]> {
  if (process.env.MODEL_AUTO_REROUTE === 'false') return [];
  invalidateModelResolverCache();
  const c = await load();

  const { rows: retiredRows } = await pool.query(
    `SELECT id, removed_at FROM upstream_models WHERE status <> 'active'`,
  );
  const removedAt = new Map<string, Date | null>(retiredRows.map(r => [r.id, r.removed_at]));

  const successor = (id: string): string | null => {
    if (c.active.has(id) || !c.known.has(id)) return null; // only known-retired ids
    const alias = c.aliases[id];
    if (alias && c.active.has(alias)) return alias;
    return pickReplacement(id, c.active.values());
  };
  const pastGrace = (id: string): boolean => {
    const at = removedAt.get(id);
    return !!at && Date.now() - new Date(at).getTime() > DEFAULT_MODEL_GRACE_HOURS * 3600_000;
  };

  const changes: { key: string; from: string; to: string }[] = [];
  const { rows } = await pool.query(`SELECT id, name, scopes, default_model FROM api_keys`);
  for (const k of rows) {
    const scopes: string[] = k.scopes ?? [];
    const next = [...scopes];
    for (const s of scopes) {
      const to = successor(s);
      if (to && !next.includes(to)) {
        next.push(to);
        changes.push({ key: k.name, from: s, to: `${to} (added to scope)` });
      }
    }

    let def: string | null = k.default_model;
    const defTo = def && pastGrace(def) ? successor(def) : null;
    if (def && defTo) {
      changes.push({ key: k.name, from: `default:${def}`, to: defTo });
      def = defTo;
      if (next.length > 0 && !next.includes(defTo)) next.push(defTo);
    }

    if (next.length !== scopes.length || defTo) {
      await pool.query(`UPDATE api_keys SET scopes = $1, default_model = $2 WHERE id = $3`, [next, def, k.id]);
    }
  }

  for (const ch of changes) console.log(`[model-resolver] API key "${ch.key}": ${ch.from} → ${ch.to}`);
  return changes;
}
