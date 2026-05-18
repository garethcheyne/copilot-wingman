#!/usr/bin/env node
// Hard parallel tool calling test against Wingman.
//
// The model must call many tools per turn, across multiple tool types, and
// then synthesise a structured comparative answer. Supports multi-round
// tool calling — we loop until finish_reason !== 'tool_calls'.
//
// Usage:
//   node scripts/test-parallel-tools.mjs
//   WINGMAN_MODEL=gpt-5-mini node scripts/test-parallel-tools.mjs

const BASE = process.env.WINGMAN_URL ?? 'http://localhost:3200';
const KEY = process.env.WINGMAN_KEY ?? 'wm_157ae08a045d8f60d6b72ec7e098eb433a58b3827c2d6e0f';
const MODEL = process.env.WINGMAN_MODEL ?? 'claude-sonnet-4.6';
const MAX_ROUNDS = 6;

// ─── Tool catalogue ─────────────────────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a city. Always call this in parallel for all requested cities in a single turn.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          unit: { type: 'string', enum: ['C', 'F'], default: 'C' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_local_time',
      description: 'Get the current local time and UTC offset for a city. Call in parallel for all cities.',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'convert_currency',
      description: 'Convert an amount between two ISO 4217 currency codes. Call in parallel for each (from,to,amount) triple.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'ISO 4217, e.g. NZD' },
          to: { type: 'string', description: 'ISO 4217, e.g. JPY' },
          amount: { type: 'number' },
        },
        required: ['from', 'to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_flight_duration',
      description: 'Estimated flight duration in hours between two cities. Call in parallel for each route.',
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
        },
        required: ['origin', 'destination'],
      },
    },
  },
];

// ─── Tool implementations ───────────────────────────────────────────────────

const weatherDB = {
  Tokyo: { tempC: 19, condition: 'clear', humidity: 55, windKph: 8 },
  Paris: { tempC: 15, condition: 'partly cloudy', humidity: 68, windKph: 14 },
  London: { tempC: 12, condition: 'overcast', humidity: 78, windKph: 22 },
  Reykjavik: { tempC: 4, condition: 'snow showers', humidity: 85, windKph: 35 },
  Auckland: { tempC: 17, condition: 'rain', humidity: 80, windKph: 18 },
};

const timeDB = {
  Tokyo: { utcOffset: '+09:00', localTime: '21:30' },
  Paris: { utcOffset: '+02:00', localTime: '14:30' },
  London: { utcOffset: '+01:00', localTime: '13:30' },
  Reykjavik: { utcOffset: '+00:00', localTime: '12:30' },
  Auckland: { utcOffset: '+12:00', localTime: '00:30' },
};

const fxDB = {
  NZD: { JPY: 88.6, EUR: 0.555, GBP: 0.472, ISK: 84.1, USD: 0.605 },
  USD: { JPY: 146.4, EUR: 0.918, GBP: 0.780, ISK: 139.0, NZD: 1.654 },
};

const flightHours = {
  'Auckland|Tokyo': 11.0,
  'Auckland|Paris': 24.5,
  'Auckland|London': 23.5,
  'Auckland|Reykjavik': 28.0,
};

function getWeather({ city, unit = 'C' }) {
  const f = weatherDB[city];
  if (!f) return { error: `Unknown city: ${city}` };
  const temp = unit === 'F' ? Math.round(f.tempC * 9 / 5 + 32) : f.tempC;
  return { city, temperature: `${temp}°${unit}`, condition: f.condition, humidity: f.humidity, windKph: f.windKph };
}

function getLocalTime({ city }) {
  const t = timeDB[city];
  if (!t) return { error: `Unknown city: ${city}` };
  return { city, ...t };
}

function convertCurrency({ from, to, amount }) {
  const rate = fxDB[from]?.[to];
  if (!rate) return { error: `No rate for ${from}→${to}` };
  return { from, to, amount, converted: Math.round(amount * rate * 100) / 100, rate };
}

function getFlightDuration({ origin, destination }) {
  const k1 = `${origin}|${destination}`;
  const k2 = `${destination}|${origin}`;
  const hrs = flightHours[k1] ?? flightHours[k2];
  if (hrs == null) return { error: `No route ${origin}→${destination}` };
  return { origin, destination, hours: hrs };
}

const dispatch = {
  get_weather: getWeather,
  get_local_time: getLocalTime,
  convert_currency: convertCurrency,
  get_flight_duration: getFlightDuration,
};

// ─── Wingman client ─────────────────────────────────────────────────────────

// Demonstrate three-axis attribution: the calling app identifies itself with
// the API key, the end-user via `user` (OpenAI standard) AND the X-Wingman-User
// header, and the conversation thread via X-Wingman-Conversation.
const END_USER = process.env.WINGMAN_USER ?? 'john@acme-travel.example';
const CONVERSATION = process.env.WINGMAN_CONVERSATION ?? `trip-planning-${new Date().toISOString().slice(0, 10)}`;

async function chat(messages) {
  const res = await fetch(`${BASE}/api/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'X-Wingman-User': END_USER,
      'X-Wingman-Conversation': CONVERSATION,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      stream: false,
      user: END_USER,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, text);
    process.exit(1);
  }
  return JSON.parse(text);
}

// ─── Scenario ───────────────────────────────────────────────────────────────

const messages = [
  {
    role: 'system',
    content: [
      'You are a meticulous travel-planning assistant.',
      'When you need data, call the available tools — and call EVERY tool you need in a SINGLE assistant turn, in parallel.',
      'Do not call tools one-at-a-time across multiple turns when you could batch them.',
      'After all tool results are in, produce a structured comparative answer in Markdown:',
      '  • A Markdown table with one row per destination and columns for local time, weather, flight time from Auckland, and the cost of NZD 1500 in local currency.',
      '  • Then a short ranked recommendation (best → worst) with one-sentence reasoning per destination.',
      '  • End with a single bolded recommended destination.',
    ].join('\n'),
  },
  {
    role: 'user',
    content: [
      "I'm flying from Auckland next week and considering Tokyo, Paris, London, and Reykjavik.",
      'For each destination, tell me:',
      '  1) current weather (in Celsius),',
      '  2) current local time and UTC offset,',
      '  3) approximate flight duration from Auckland,',
      '  4) what NZD 1500 converts to in the local currency.',
      'Then rank them for a relaxed 7-day trip starting tomorrow and recommend one.',
    ].join('\n'),
  },
];

console.log(`→ Model: ${MODEL}`);
console.log(`→ End-user: ${END_USER}`);
console.log(`→ Conversation: ${CONVERSATION}`);
console.log(`→ Prompt:\n${messages[1].content}\n`);

let history = [...messages];
let round = 0;
let totalCalls = 0;
let maxCallsInTurn = 0;
let lastMsg = null;
let usage = null;

while (round < MAX_ROUNDS) {
  round++;
  const resp = await chat(history);
  const choice = resp.choices?.[0];
  if (!choice) {
    console.error('No choices in response:', JSON.stringify(resp, null, 2));
    process.exit(1);
  }
  usage = resp.usage;
  const msg = choice.message;
  const calls = msg?.tool_calls ?? [];
  lastMsg = msg;

  console.log(`── Round ${round} ──`);
  console.log(`   tool_calls: ${calls.length}   finish_reason: ${choice.finish_reason}`);
  if (calls.length > 0) {
    maxCallsInTurn = Math.max(maxCallsInTurn, calls.length);
    totalCalls += calls.length;
    for (const c of calls) {
      let args = c.function.arguments;
      try { args = JSON.stringify(JSON.parse(c.function.arguments)); } catch {}
      console.log(`     • ${c.function.name}(${args})`);
    }
  }

  if (choice.finish_reason !== 'tool_calls' || calls.length === 0) break;

  // Execute every tool call and feed the results back.
  const toolMessages = calls.map((c) => {
    let args = {};
    try { args = JSON.parse(c.function.arguments); } catch {}
    const fn = dispatch[c.function.name];
    const result = fn ? fn(args) : { error: `Unknown tool: ${c.function.name}` };
    return { role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) };
  });

  history = [...history, msg, ...toolMessages];
}

console.log('\n── Final assistant message ──\n');
console.log(lastMsg?.content ?? '(no content)');

if (usage) {
  console.log(`\n── Usage ── prompt: ${usage.prompt_tokens}  completion: ${usage.completion_tokens}  total: ${usage.total_tokens}`);
}

// ─── Validation ─────────────────────────────────────────────────────────────

const content = String(lastMsg?.content ?? '');
const cities = ['Tokyo', 'Paris', 'London', 'Reykjavik'];

const checks = [
  ['Mentions every city', cities.every((c) => content.includes(c))],
  ['Contains a Markdown table', /\|.*\|.*\|/.test(content) && content.includes('---')],
  ['Mentions JPY or yen', /JPY|yen|¥/i.test(content)],
  ['Mentions EUR or euro', /EUR|euro|€/i.test(content)],
  ['Mentions GBP or pound', /GBP|pound|£/i.test(content)],
  ['Mentions ISK or krón', /ISK|krón/i.test(content)],
  ['Mentions hours (flight duration)', /\bhours?\b|\bhr\b/i.test(content)],
  ['Mentions UTC offset', /UTC\s*[+-]\d/i.test(content) || /\+\d{2}:\d{2}/.test(content)],
  ['Has a ranking section', /rank|recommend|best/i.test(content)],
  ['Has bolded recommendation', /\*\*[A-Za-z]+/.test(content)],
];

console.log('\n── Validation ──');
for (const [label, ok] of checks) {
  console.log(`   ${ok ? '✅' : '❌'} ${label}`);
}
const passed = checks.filter(([, ok]) => ok).length;
console.log(`   ${passed}/${checks.length} checks passed`);

console.log('\n── Parallel-call summary ──');
console.log(`   rounds used:                 ${round}`);
console.log(`   total tool calls executed:   ${totalCalls}`);
console.log(`   max tool calls in one turn:  ${maxCallsInTurn}`);
console.log(
  `   ${maxCallsInTurn >= 2 ? '✅' : '❌'} Parallel tool calling: ${maxCallsInTurn >= 2 ? 'YES' : 'NO'} (need ≥2 calls in one turn)`,
);
const expectedTotal = 4 /*weather*/ + 4 /*time*/ + 4 /*currency*/ + 4 /*flights*/;
console.log(`   ${totalCalls >= expectedTotal ? '✅' : '⚠️ '} Tool coverage: ${totalCalls}/${expectedTotal} expected calls`);

const score = passed === checks.length && maxCallsInTurn >= 2 && totalCalls >= expectedTotal;
process.exit(score ? 0 : 1);
