#!/usr/bin/env node
/**
 * Wingman — end-to-end API key test runner.
 *
 * Reads .env at the repo root and exercises the chat API against either
 * the local dev server or the production server, using whichever set of
 * five testing API keys you've defined.
 *
 * USAGE
 *   node scripts/test-script.js                # local (default)
 *   node scripts/test-script.js --env=prod     # production
 *   node scripts/test-script.js --env=prod --key=2          # only key #2
 *   node scripts/test-script.js --env=prod --stream         # use SSE streaming
 *   node scripts/test-script.js --env=prod --model=gpt-4o   # override model
 *   node scripts/test-script.js --env=prod --prompt="hi"    # custom prompt
 *
 * ENV VARS (read from repo-root .env, with sensible fallbacks)
 *   Local:
 *     NEXT_PUBLIC_PROXY_URL          base URL (default http://localhost:3200)
 *     API_TESTING_KEY_01..05         API keys
 *   Prod:
 *     PROD_URL                       base URL (default https://wingman.err403.com)
 *     API_PROD_TESTING_KEY_01..05    API keys
 *
 * EXIT CODES
 *   0  every test passed
 *   1  at least one test failed
 *   2  configuration error (e.g. no keys defined for the chosen env)
 */

const fs = require('node:fs');
const path = require('node:path');

// ── Minimal .env loader (no dependency on dotenv) ────────────────────────────
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const repoRoot = path.resolve(__dirname, '..');
const env = { ...loadEnvFile(path.join(repoRoot, '.env')), ...process.env };

// ── ANSI colours ────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const c = {
  reset:  isTTY ? '\x1b[0m'  : '',
  dim:    isTTY ? '\x1b[2m'  : '',
  bold:   isTTY ? '\x1b[1m'  : '',
  green:  isTTY ? '\x1b[32m' : '',
  red:    isTTY ? '\x1b[31m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  blue:   isTTY ? '\x1b[34m' : '',
  cyan:   isTTY ? '\x1b[36m' : '',
  gray:   isTTY ? '\x1b[90m' : '',
};

// ── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name, def) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  if (!hit.includes('=')) return true;
  return hit.slice(hit.indexOf('=') + 1);
}

const envName = String(flag('env', 'local')).toLowerCase();
const onlyKey = flag('key', null); // 1..5 or null = all
const useStream = flag('stream', false) === true;
const modelOverride = flag('model', null);
const promptOverride = flag('prompt', null);
const verbose = flag('verbose', false) === true;

if (!['local', 'prod'].includes(envName)) {
  console.error(`${c.red}--env must be 'local' or 'prod'${c.reset}`);
  process.exit(2);
}

// ── Resolve base URL + keys based on env ────────────────────────────────────
const baseUrl =
  envName === 'prod'
    ? (env.PROD_URL || 'https://wingman.err403.com').replace(/\/+$/, '')
    : (env.NEXT_PUBLIC_PROXY_URL || 'http://localhost:3200').replace(/\/+$/, '');

const keyVarPrefix = envName === 'prod' ? 'API_PROD_TESTING_KEY_' : 'API_TESTING_KEY_';
const allKeys = Array.from({ length: 5 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { idx: i + 1, name: `${keyVarPrefix}${n}`, value: env[`${keyVarPrefix}${n}`] };
}).filter((k) => k.value);

if (allKeys.length === 0) {
  console.error(
    `${c.red}No keys defined for env '${envName}'. ` +
      `Expected ${keyVarPrefix}01..05 in .env.${c.reset}`
  );
  process.exit(2);
}

const keysToTest = onlyKey
  ? allKeys.filter((k) => String(k.idx) === String(onlyKey))
  : allKeys;

if (keysToTest.length === 0) {
  console.error(`${c.red}--key=${onlyKey} did not match any configured key.${c.reset}`);
  process.exit(2);
}

const testModel = modelOverride || null; // resolved per-key from /api/models if not overridden
const testPrompt = promptOverride || 'Reply with exactly the word PONG and nothing else.';

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtMs(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}
function maskKey(key) {
  if (!key) return '';
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 60_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return { res, ms: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function readStreamText(res, maxBytes = 4096) {
  // Concatenate enough SSE chunks to prove streaming works without
  // draining the whole response.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let bytes = 0;
  while (bytes < maxBytes) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    buf += decoder.decode(value, { stream: true });
  }
  try { reader.cancel(); } catch { /* ignore */ }
  return buf;
}

// ── Test definitions ────────────────────────────────────────────────────────
// Per-key shared state so later tests can use info collected by earlier ones
// (e.g. fall back to a model the key is actually allowed to use).
const keyState = new WeakMap();
function state(key) {
  let s = keyState.get(key);
  if (!s) keyState.set(key, (s = {}));
  return s;
}

const tests = [
  {
    name: 'GET /health',
    run: async () => {
      // In prod the reverse proxy usually only exposes /api/* to the proxy
      // container, so /api/health is the canonical URL. Local dev mounts
      // the proxy on its own port and serves both. Try the api-prefixed
      // path first, then fall back.
      for (const candidate of ['/api/health', '/health']) {
        const { res, ms } = await request(`${baseUrl}${candidate}`);
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ms, detail: `${candidate} → ${body.status || 'ok'}` };
        }
      }
      throw new Error('neither /api/health nor /health responded');
    },
  },
  {
    name: 'GET /api/models',
    run: async (key) => {
      const { res, ms } = await request(`${baseUrl}/api/models`, {
        headers: { Authorization: `Bearer ${key.value}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text().catch(() => '')).slice(0, 120)}`);
      const body = await res.json();
      const list =
        (Array.isArray(body) && body) ||
        (Array.isArray(body?.data) && body.data) ||
        (Array.isArray(body?.models) && body.models) ||
        [];
      // Remember the first model the key is allowed to use, so the chat
      // test below has a sensible default instead of hardcoded gpt-4o.
      const firstId =
        list.find((m) => typeof m === 'string') ||
        list.find((m) => m?.id)?.id ||
        list.find((m) => m?.name)?.name ||
        null;
      state(key).firstAllowedModel = firstId;
      return { ms, detail: `${list.length} model(s)${firstId ? ` (first: ${firstId})` : ''}` };
    },
  },
  {
    name: () => `POST /api/chat (stream=${useStream})`,
    run: async (key) => {
      const modelToUse = modelOverride || state(key).firstAllowedModel || 'gpt-4o';
      const sessionKey = `test-${envName}-key${key.idx}-${Date.now()}`;
      const { res, ms } = await request(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.value}` },
        body: {
          sessionKey,
          message: testPrompt,
          model: modelToUse,
          stream: useStream,
        },
        timeoutMs: 90_000,
      });

      if (!res.ok) {
        const errText = (await res.text().catch(() => '')).slice(0, 200);
        throw new Error(`HTTP ${res.status} — ${errText}`);
      }

      if (useStream) {
        const snippet = await readStreamText(res);
        if (!snippet.includes('data:') && !snippet.includes('"choices"')) {
          throw new Error('Stream did not look like SSE');
        }
        return {
          ms,
          detail:
            `${modelToUse} streamed ${snippet.length}B` +
            (verbose ? `\n${c.gray}${snippet.slice(0, 200)}…${c.reset}` : ''),
        };
      }

      const body = await res.json();
      const content =
        body?.choices?.[0]?.message?.content ??
        body?.message ??
        body?.content ??
        JSON.stringify(body).slice(0, 80);
      return { ms, detail: `${modelToUse} → "${String(content).trim().slice(0, 60)}"` };
    },
  },
];

// ── Runner ──────────────────────────────────────────────────────────────────
async function runForKey(key) {
  console.log(`\n${c.cyan}${c.bold}── Key #${key.idx} (${key.name}: ${maskKey(key.value)})${c.reset}`);
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    const name = typeof t.name === 'function' ? t.name() : t.name;
    process.stdout.write(`  ${c.dim}▸${c.reset} ${name} `);
    try {
      const r = await t.run(key);
      console.log(`${c.green}✓${c.reset} ${c.gray}(${fmtMs(r.ms)})${c.reset}  ${r.detail || ''}`);
      pass++;
    } catch (err) {
      console.log(`${c.red}✗${c.reset} ${err.message}`);
      fail++;
    }
  }
  return { pass, fail };
}

(async () => {
  console.log(
    `${c.bold}Wingman API test${c.reset}  ${c.dim}→${c.reset} ` +
      `${c.blue}${baseUrl}${c.reset}  ${c.dim}[${envName}]${c.reset}\n` +
      `${c.dim}keys:${c.reset} ${keysToTest.map((k) => `#${k.idx}`).join(' ')}   ` +
      `${c.dim}model:${c.reset} ${testModel || '(first allowed)'}   ` +
      `${c.dim}stream:${c.reset} ${useStream}`
  );

  let totalPass = 0;
  let totalFail = 0;
  const t0 = Date.now();
  for (const key of keysToTest) {
    const { pass, fail } = await runForKey(key);
    totalPass += pass;
    totalFail += fail;
  }
  const elapsed = Date.now() - t0;

  console.log(
    `\n${c.bold}Summary${c.reset}  ${c.green}${totalPass} passed${c.reset}` +
      (totalFail ? `   ${c.red}${totalFail} failed${c.reset}` : '') +
      `   ${c.gray}(${fmtMs(elapsed)} total)${c.reset}`
  );

  process.exit(totalFail ? 1 : 0);
})().catch((err) => {
  console.error(`${c.red}Test runner crashed:${c.reset}`, err);
  process.exit(1);
});
