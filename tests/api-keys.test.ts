/**
 * API Key Integration Tests — Self-Generating
 *
 * Uses Key 04 (widest scope) as a "test director" to generate random questions,
 * then feeds those questions to other keys/models to verify scope enforcement,
 * default model injection, auth, and cross-key isolation.
 *
 * Run:  cd proxy && npx tsx ../tests/api-keys.test.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env manually (no dotenv dependency needed) — skip if not present (CI sets env vars directly)
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────────

const BASE = `http://localhost:${process.env.PROXY_PORT ?? '3200'}`;
const CHAT = `${BASE}/api/chat`;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY!;

interface KeyDef {
  name: string;
  key: string;
  scopes: string[];
  defaultModel: string;
}

const KEYS: Record<string, KeyDef> = {
  K01: {
    name: 'Key 01 (single scope)',
    key: process.env.API_TESTING_KEY_01!,
    scopes: ['claude-sonnet-4.6'],
    defaultModel: 'claude-sonnet-4.6',
  },
  K02: {
    name: 'Key 02 (3 models)',
    key: process.env.API_TESTING_KEY_02!,
    scopes: ['claude-opus-4.6', 'gpt-5.2-codex', 'claude-opus-4.5'],
    defaultModel: 'claude-opus-4.5',
  },
  K03: {
    name: 'Key 03 (lightweight)',
    key: process.env.API_TESTING_KEY_03!,
    scopes: ['gpt-5.4-mini', 'gemini-3-flash-preview', 'gpt-5-mini', 'claude-haiku-4.5'],
    defaultModel: 'gpt-5.4-mini',
  },
  K04: {
    name: 'Key 04 (wide scope)',
    key: process.env.API_TESTING_KEY_04!,
    scopes: ['claude-opus-4.6', 'gemini-2.5-pro', 'gpt-5.3-codex', 'gpt-5.4', 'claude-opus-4.7', 'claude-sonnet-4.5', 'claude-sonnet-4.6'],
    defaultModel: 'gpt-5.4',
  },
  K05: {
    name: 'Key 05 (mixed)',
    key: process.env.API_TESTING_KEY_05!,
    scopes: ['gemini-2.5-pro', 'claude-sonnet-4.6', 'claude-sonnet-4.5', 'gpt-5.2'],
    defaultModel: 'claude-sonnet-4.6',
  },
};

// Use Key 04 as the test director — it has the widest scope
const DIRECTOR = KEYS.K04;
const DIRECTOR_MODEL = 'claude-sonnet-4.6'; // reliable model for question generation

// All unique models across all keys
const ALL_MODELS = [...new Set(Object.values(KEYS).flatMap((k) => k.scopes))];

// ─── Helpers ────────────────────────────────────────────────────────────────────

let seq = 0;
const session = () => `test-${Date.now()}-${++seq}`;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

function banner(text: string) {
  console.log(`\n${c.cyan}${c.bold}━━━ ${text} ━━━${c.reset}`);
}

function sectionHeader(text: string) {
  console.log(`\n  ${c.magenta}${c.bold}▸ ${text}${c.reset}`);
}

async function chatReq(
  body: Record<string, any>,
  auth: { bearer?: string; xApiKey?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.bearer) headers['Authorization'] = `Bearer ${auth.bearer}`;
  if (auth.xApiKey) headers['x-api-key'] = auth.xApiKey;
  return fetch(CHAT, { method: 'POST', headers, body: JSON.stringify(body) });
}

/** Ask the director model to generate something */
async function askDirector(prompt: string): Promise<string> {
  const res = await chatReq(
    { sessionKey: session(), message: prompt, model: DIRECTOR_MODEL },
    { bearer: DIRECTOR.key },
  );
  if (!res.ok) throw new Error(`Director failed (${res.status})`);
  const data = (await res.json()) as { message: string };
  return data.message.trim();
}

// ─── Test Framework ─────────────────────────────────────────────────────────────

interface Result { name: string; pass: boolean; error?: string; ms: number; detail?: string }
const results: Result[] = [];

async function test(name: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ name, pass: true, ms, detail: detail ?? undefined });
    const detailStr = detail ? ` ${c.gray}→ ${detail}${c.reset}` : '';
    console.log(`    ${c.green}✓${c.reset} ${name} ${c.dim}(${ms}ms)${c.reset}${detailStr}`);
  } catch (err: any) {
    const ms = Date.now() - t0;
    results.push({ name, pass: false, error: err.message, ms });
    console.log(`    ${c.red}✗${c.reset} ${name} ${c.dim}(${ms}ms)${c.reset}`);
    console.log(`      ${c.red}${err.message}${c.reset}`);
  }
}

function assertEqual(actual: any, expected: any, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── Test Suites ────────────────────────────────────────────────────────────────

async function runTests() {
  banner('API Key Integration Tests');
  console.log(`  ${c.dim}Director: ${DIRECTOR.name} via ${DIRECTOR_MODEL}${c.reset}`);
  console.log(`  ${c.dim}Keys: ${Object.values(KEYS).map((k) => k.name).join(', ')}${c.reset}`);
  console.log(`  ${c.dim}Models in play: ${ALL_MODELS.length}${c.reset}`);

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 1: Authentication
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 1 — Authentication');

  sectionHeader('Reject invalid credentials');

  await test('No auth header → 401', async () => {
    const res = await chatReq({ sessionKey: session(), message: 'hi' });
    assertEqual(res.status, 401, 'status');
  });

  await test('Garbage Bearer token → 401', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: 'hi' },
      { bearer: 'wm_' + '0'.repeat(48) },
    );
    assertEqual(res.status, 401, 'status');
  });

  await test('Non-wm_ format token → 401', async () => {
    const res = await chatReq({ sessionKey: session(), message: 'hi' }, { bearer: 'sk-fake-openai-key' });
    assertEqual(res.status, 401, 'status');
  });

  await test('Empty Bearer → 401', async () => {
    const res = await chatReq({ sessionKey: session(), message: 'hi' }, { bearer: '' });
    assertEqual(res.status, 401, 'status');
  });

  await test('Truncated key → 401', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: 'hi' },
      { bearer: KEYS.K01.key.slice(0, 20) },
    );
    assertEqual(res.status, 401, 'status');
  });

  sectionHeader('Accept valid credentials');

  await test('Internal key via x-api-key → 200', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: 'Say "ok"', model: 'claude-sonnet-4.6' },
      { xApiKey: INTERNAL_KEY },
    );
    assertEqual(res.status, 200, 'status');
  });

  for (const [id, k] of Object.entries(KEYS)) {
    await test(`${k.name} via Bearer → 200`, async () => {
      const res = await chatReq(
        { sessionKey: session(), message: 'Say "ok"', model: k.scopes[0] },
        { bearer: k.key },
      );
      assertEqual(res.status, 200, 'status');
      return `model: ${k.scopes[0]}`;
    });
  }

  await test('wm_ key via x-api-key header (convenience) → 200', async () => {
    const k = KEYS.K01;
    const res = await chatReq(
      { sessionKey: session(), message: 'Say "ok"', model: k.scopes[0] },
      { xApiKey: k.key },
    );
    assertEqual(res.status, 200, 'status');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 2: Director generates random questions for scope testing
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 2 — Director-Generated Scope Tests');

  sectionHeader('Generating random questions via director');

  // Ask the director to create a batch of short random questions
  const rawQuestions = await askDirector(
    'Generate exactly 8 short, unique, random trivia questions on different topics ' +
    '(science, history, math, geography, music, food, sports, language). ' +
    'Output ONLY a JSON array of strings, no markdown, no explanation. Example: ["What is...","Who was..."]'
  );

  let questions: string[];
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = rawQuestions.match(/\[[\s\S]*\]/);
    questions = JSON.parse(jsonMatch![0]);
    assert(questions.length >= 5, `Need at least 5 questions, got ${questions.length}`);
  } catch {
    // Fallback if parsing fails
    questions = [
      'What is the speed of light in km/s?',
      'Who painted the Mona Lisa?',
      'What is the square root of 144?',
      'Name the largest ocean.',
      'What year did WW2 end?',
      'What element has atomic number 6?',
      'How many continents are there?',
      'What is the capital of Japan?',
    ];
    console.log(`    ${c.yellow}⚠ Couldn't parse director questions, using fallback set${c.reset}`);
  }

  console.log(`    ${c.dim}Generated ${questions.length} questions${c.reset}`);
  for (const q of questions) {
    console.log(`    ${c.gray}  • ${q.slice(0, 80)}${c.reset}`);
  }

  // ─── Test allowed models with random questions ───────────────────────────────
  sectionHeader('Allowed model access (random questions)');

  let qIdx = 0;
  for (const [id, k] of Object.entries(KEYS)) {
    // Test each model in the key's scope with a different random question
    for (const model of k.scopes) {
      const question = questions[qIdx % questions.length];
      qIdx++;

      await test(`${k.name} → ${model}`, async () => {
        const res = await chatReq(
          { sessionKey: session(), message: question, model },
          { bearer: k.key },
        );
        assertEqual(res.status, 200, 'status');
        const body = (await res.json()) as { message: string };
        assert(body.message.length > 0, 'Response should not be empty');
        return `Q: "${question.slice(0, 40)}…" → ${body.message.slice(0, 50)}…`;
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 3: Scope Enforcement — Denied Models
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 3 — Scope Enforcement (Denied)');

  sectionHeader('Each key denied models outside its scope');

  for (const [id, k] of Object.entries(KEYS)) {
    const forbidden = ALL_MODELS.filter((m) => !k.scopes.includes(m));
    // Test up to 3 denied models per key
    for (const model of forbidden.slice(0, 3)) {
      await test(`${k.name} ✗ ${model} → 403`, async () => {
        const res = await chatReq(
          { sessionKey: session(), message: 'hi', model },
          { bearer: k.key },
        );
        assertEqual(res.status, 403, 'status');
        const body = (await res.json()) as { error: string; allowed_models: string[] };
        assert(body.error.includes('not authorized'), 'Error should say not authorized');
        assert(Array.isArray(body.allowed_models), 'Should return allowed_models');
        // Verify the returned allowed list matches the key's actual scopes
        for (const s of k.scopes) {
          assert(body.allowed_models.includes(s), `allowed_models should include ${s}`);
        }
        return `allowed: [${body.allowed_models.join(', ')}]`;
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 4: Cross-Key Isolation
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 4 — Cross-Key Isolation');

  sectionHeader('Exclusive models cannot be borrowed');

  // Key 01 (only claude-sonnet-4.6) cannot use Key 02's exclusive models
  const k01Exclusive = [
    { model: 'claude-opus-4.5', owner: 'Key 02' },
    { model: 'gpt-5.2-codex', owner: 'Key 02' },
  ];
  for (const { model, owner } of k01Exclusive) {
    await test(`Key 01 ✗ ${model} (${owner} only)`, async () => {
      const res = await chatReq(
        { sessionKey: session(), message: 'hi', model },
        { bearer: KEYS.K01.key },
      );
      assertEqual(res.status, 403, 'status');
    });
  }

  // Key 03 (lightweight) cannot use Key 04's powerful exclusive models
  const k03Forbidden = [
    { model: 'claude-opus-4.7', owner: 'Key 04' },
    { model: 'gpt-5.3-codex', owner: 'Key 04' },
    { model: 'gpt-5.4', owner: 'Key 04' },
  ];
  for (const { model, owner } of k03Forbidden) {
    await test(`Key 03 ✗ ${model} (${owner} only)`, async () => {
      const res = await chatReq(
        { sessionKey: session(), message: 'hi', model },
        { bearer: KEYS.K03.key },
      );
      assertEqual(res.status, 403, 'status');
    });
  }

  // Key 02 cannot use Key 03 exclusive models
  await test('Key 02 ✗ gpt-5.4-mini (Key 03 only)', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: 'hi', model: 'gpt-5.4-mini' },
      { bearer: KEYS.K02.key },
    );
    assertEqual(res.status, 403, 'status');
  });

  // Key 05 cannot use Key 03 exclusive models
  await test('Key 05 ✗ gemini-3-flash-preview (Key 03 only)', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: 'hi', model: 'gemini-3-flash-preview' },
      { bearer: KEYS.K05.key },
    );
    assertEqual(res.status, 403, 'status');
  });

  sectionHeader('Shared models accessible by multiple keys');

  // claude-sonnet-4.6 is shared by K01, K04, K05
  const sharedSonnet = ['K01', 'K04', 'K05'] as const;
  for (const id of sharedSonnet) {
    const k = KEYS[id];
    await test(`${k.name} → claude-sonnet-4.6 (shared)`, async () => {
      const q = questions[qIdx++ % questions.length];
      const res = await chatReq(
        { sessionKey: session(), message: q, model: 'claude-sonnet-4.6' },
        { bearer: k.key },
      );
      assertEqual(res.status, 200, 'status');
      const body = (await res.json()) as { message: string };
      return `"${q.slice(0, 30)}…" → "${body.message.slice(0, 40)}…"`;
    });
  }

  // gemini-2.5-pro is shared by K04, K05
  for (const id of ['K04', 'K05'] as const) {
    const k = KEYS[id];
    await test(`${k.name} → gemini-2.5-pro (shared)`, async () => {
      const q = questions[qIdx++ % questions.length];
      const res = await chatReq(
        { sessionKey: session(), message: q, model: 'gemini-2.5-pro' },
        { bearer: k.key },
      );
      assertEqual(res.status, 200, 'status');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 5: Default Model Injection
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 5 — Default Model Injection');

  sectionHeader('No model specified → uses default model');

  // Ask director to generate unique challenge per key
  const challengeRaw = await askDirector(
    'Create exactly 5 unique one-sentence challenges for an AI (like "explain quantum entanglement in one sentence" ' +
    'or "write a haiku about the ocean"). Output ONLY a JSON array of strings. No markdown.'
  );

  let challenges: string[];
  try {
    const match = challengeRaw.match(/\[[\s\S]*\]/);
    challenges = JSON.parse(match![0]);
  } catch {
    challenges = [
      'Explain gravity in exactly 10 words',
      'Write a limerick about coding',
      'Name 3 animals that start with the letter P',
      'What is 17 times 23?',
      'Describe the color blue to someone who has never seen it',
    ];
    console.log(`    ${c.yellow}⚠ Using fallback challenges${c.reset}`);
  }

  let cIdx = 0;
  for (const [id, k] of Object.entries(KEYS)) {
    const challenge = challenges[cIdx++ % challenges.length];
    await test(`${k.name} → default: ${k.defaultModel}`, async () => {
      const res = await chatReq(
        { sessionKey: session(), message: challenge },  // NO model field
        { bearer: k.key },
      );
      assertEqual(res.status, 200, 'status');
      const body = (await res.json()) as { message: string };
      assert(body.message.length > 0, 'Should get a response from default model');
      return `Challenge: "${challenge.slice(0, 40)}…" → "${body.message.slice(0, 40)}…"`;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 6: Request Validation
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 6 — Request Validation');

  sectionHeader('Missing required fields');

  await test('Empty sessionKey → 400', async () => {
    const res = await chatReq(
      { sessionKey: '', message: 'hi', model: KEYS.K01.scopes[0] },
      { bearer: KEYS.K01.key },
    );
    assertEqual(res.status, 400, 'status');
  });

  await test('Empty message → 400', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: '', model: KEYS.K01.scopes[0] },
      { bearer: KEYS.K01.key },
    );
    assertEqual(res.status, 400, 'status');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 7: Admin Route Protection
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 7 — Admin Route Protection');

  sectionHeader('API keys cannot access admin endpoints');

  const adminPaths = ['/api/admin/api-keys', '/api/admin/usage', '/api/admin/models'];

  for (const [id, k] of Object.entries(KEYS)) {
    await test(`${k.name} ✗ admin routes → 401`, async () => {
      for (const path of adminPaths) {
        const res = await fetch(`${BASE}${path}`, {
          headers: { 'Authorization': `Bearer ${k.key}` },
        });
        assertEqual(res.status, 401, `${path} status`);
      }
      return `blocked on ${adminPaths.length} endpoints`;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 8: Streaming
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 8 — Streaming');

  sectionHeader('SSE streaming with API keys');

  await test('Key 01 stream → SSE content-type', async () => {
    const q = questions[qIdx++ % questions.length];
    const res = await chatReq(
      { sessionKey: session(), message: q, model: KEYS.K01.scopes[0], stream: true },
      { bearer: KEYS.K01.key },
    );
    assertEqual(res.status, 200, 'status');
    const ct = res.headers.get('content-type');
    assert(ct?.includes('text/event-stream') === true, 'Should be SSE');
    const body = await res.text();
    assert(body.length > 0, 'Stream should have content');
    return `${body.length} bytes streamed`;
  });

  await test('Key 04 stream with explicit model', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: 'Count from 1 to 5', model: 'claude-sonnet-4.6', stream: true },
      { bearer: KEYS.K04.key },
    );
    assertEqual(res.status, 200, 'status');
    await res.text();
  });

  await test('Key 03 stream denied model → 403 (not streamed)', async () => {
    const res = await chatReq(
      { sessionKey: session(), message: 'hi', model: 'claude-opus-4.6', stream: true },
      { bearer: KEYS.K03.key },
    );
    assertEqual(res.status, 403, 'status');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 9: Model-to-Model Cross-Verification
  // ═══════════════════════════════════════════════════════════════════════════════
  banner('Phase 9 — Model-to-Model Cross-Verification');

  sectionHeader('One model generates, another answers');

  // Use Key 04 (claude-sonnet-4.6) to generate a math problem
  await test('Key 04 generates math → Key 05 solves it', async () => {
    const mathProblem = await askDirector(
      'Create a simple math problem (like "What is 15 + 27?"). ' +
      'Output ONLY the problem, nothing else.'
    );

    // Now Key 05 solves it
    const res = await chatReq(
      { sessionKey: session(), message: `Solve this: ${mathProblem}. Reply with just the number.`, model: 'claude-sonnet-4.6' },
      { bearer: KEYS.K05.key },
    );
    assertEqual(res.status, 200, 'status');
    const body = (await res.json()) as { message: string };
    assert(body.message.length > 0, 'Should produce an answer');
    return `Problem: "${mathProblem}" → Answer: "${body.message.slice(0, 30)}"`;
  });

  // Key 02 generates a riddle, Key 03 attempts to solve it
  await test('Key 02 generates riddle → Key 03 answers', async () => {
    const riddleRes = await chatReq(
      { sessionKey: session(), message: 'Create a one-line riddle. Output only the riddle.', model: 'claude-opus-4.5' },
      { bearer: KEYS.K02.key },
    );
    assertEqual(riddleRes.status, 200, 'status');
    const riddle = ((await riddleRes.json()) as { message: string }).message;

    const answerRes = await chatReq(
      { sessionKey: session(), message: `Answer this riddle: ${riddle}`, model: 'gpt-5.4-mini' },
      { bearer: KEYS.K03.key },
    );
    assertEqual(answerRes.status, 200, 'status');
    const answer = ((await answerRes.json()) as { message: string }).message;
    assert(answer.length > 0, 'Should produce an answer');
    return `Riddle: "${riddle.slice(0, 50)}…" → "${answer.slice(0, 40)}…"`;
  });

  // Key 01 generates a word, Key 04 defines it
  await test('Key 01 picks word → Key 04 defines it', async () => {
    const wordRes = await chatReq(
      { sessionKey: session(), message: 'Say one unusual English word. Output only the word, nothing else.', model: 'claude-sonnet-4.6' },
      { bearer: KEYS.K01.key },
    );
    assertEqual(wordRes.status, 200, 'status');
    const word = ((await wordRes.json()) as { message: string }).message.trim();

    const defRes = await chatReq(
      { sessionKey: session(), message: `Define the word "${word}" in one sentence.`, model: 'gpt-5.4' },
      { bearer: KEYS.K04.key },
    );
    assertEqual(defRes.status, 200, 'status');
    const def = ((await defRes.json()) as { message: string }).message;
    return `Word: "${word}" → Def: "${def.slice(0, 50)}…"`;
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Results Summary
  // ═══════════════════════════════════════════════════════════════════════════════

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  console.log(`\n${c.bold}${'━'.repeat(60)}${c.reset}`);
  console.log(
    `${c.bold}  Results: ` +
    `${c.green}${passed} passed${c.reset}${c.bold}, ` +
    `${failed > 0 ? c.red : c.green}${failed} failed${c.reset}${c.bold}, ` +
    `${results.length} total ` +
    `${c.dim}(${(totalMs / 1000).toFixed(1)}s)${c.reset}`
  );
  console.log(`${c.bold}${'━'.repeat(60)}${c.reset}`);

  if (failed > 0) {
    console.log(`\n  ${c.bgRed}${c.bold} FAILURES ${c.reset}\n`);
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ${c.red}✗ ${r.name}${c.reset}`);
      console.log(`    ${c.dim}${r.error}${c.reset}\n`);
    }
    process.exit(1);
  } else {
    console.log(`\n  ${c.bgGreen}${c.bold} ALL TESTS PASSED ${c.reset}\n`);
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error(`${c.red}Fatal:${c.reset}`, err);
  process.exit(1);
});
