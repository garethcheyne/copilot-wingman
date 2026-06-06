# @wingman/sdk

Official Node.js SDK for the Wingman chat proxy.
Zero dependencies, ESM-only, Node 18+ (uses the built-in `fetch`).

## Install

```bash
npm install @wingman/sdk
```

## Usage

### Non-streaming

```ts
import Wingman from "@wingman/sdk";

const client = new Wingman({ apiKey: process.env.WINGMAN_API_KEY });

const res = await client.chat.create({
  sessionKey: "my-session-id",     // reuse this key to keep context
  message: "Hello, who are you?",
  model: "claude-sonnet-4.6",       // optional
});

console.log(res.message);
```

### Streaming (high-level helper)

```ts
const stream = client.chat.stream({
  sessionKey: "my-session-id",
  message: "Count to ten.",
});

for await (const delta of stream) {
  process.stdout.write(delta);
}
const full = await stream.finalText();
```

### Streaming (low-level)

```ts
const raw = await client.chat.create({
  sessionKey: "my-session-id",
  message: "Hi",
  stream: true,
});

for await (const chunk of raw) {
  const delta = chunk.choices?.[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
}
```

### List models / health

```ts
const models = await client.models.list();   // [{ id: "claude-sonnet-4.6", ... }]
const health = await client.health.check();  // { status: "healthy" }
```

### Vision (images & PDFs)

Pass base64 data URLs in the `images` array. The server accepts both image
data URLs (`data:image/png;base64,...`) and PDF data URLs
(`data:application/pdf;base64,...`). PDFs are rendered server-side to per-page
PNG images automatically (max 5 pages per PDF).

```ts
import { readFileSync } from "fs";

// Send an image
const imgB64 = readFileSync("screenshot.png").toString("base64");
const res = await client.chat.create({
  sessionKey: "vision-demo",
  message: "What's in this image?",
  model: "gpt-4o",
  images: [`data:image/png;base64,${imgB64}`],
});

// Send a PDF (server renders pages to images)
const pdfB64 = readFileSync("document.pdf").toString("base64");
const res2 = await client.chat.create({
  sessionKey: "pdf-demo",
  message: "Summarise this document.",
  model: "gpt-4o",
  images: [`data:application/pdf;base64,${pdfB64}`],
});
```

Filter by capability:

```ts
const toolCapable   = await client.models.list({ supports: "tool_calls" });
const both          = await client.models.list({ supports: ["tool_calls", "vision"] });
const chatEndpoint  = await client.models.list({ endpoint: "/chat/completions" });
const shortcut      = await client.models.listToolCapable();
```

Every returned model includes a flattened `supports_tools: boolean` flag in
addition to the full `capabilities.supports` blob.

## Tool calling (OpenAI-compatible)

`client.chat.completions.create()` is a **stateless** endpoint that mirrors the
OpenAI Chat Completions shape — including `tools`, `tool_choice`, `tool_calls`,
and `role: "tool"` messages. The caller owns the conversation history.

```ts
import Wingman from "@wingman/sdk";

const client = new Wingman({ apiKey: process.env.WINGMAN_API_KEY });

// 1. Discover a tool-capable model.
const [model] = await client.models.listToolCapable();

// 2. Define your tools (JSON Schema parameters).
const tools = [{
  type: "function" as const,
  function: {
    name: "get_weather",
    description: "Get the current weather for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
}];

// 3. First turn — model decides whether to call a tool.
const messages = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user",   content: "What's the weather in Auckland?" },
];

const first = await client.chat.completions.create({
  model: model.id,
  messages,
  tools,
  tool_choice: "auto",
});

const call = first.choices[0].message.tool_calls?.[0];
if (call) {
  // 4. Run the tool locally, append the result, and call again.
  const result = JSON.stringify({ temp_c: 18, conditions: "cloudy" });

  const second = await client.chat.completions.create({
    model: model.id,
    tools,
    messages: [
      ...messages,
      first.choices[0].message,                            // assistant + tool_calls
      { role: "tool", tool_call_id: call.id, content: result },
    ],
  });

  console.log(second.choices[0].message.content);
}
```

### Streaming tool calls

```ts
const stream = await client.chat.completions.create({
  model: model.id,
  messages,
  tools,
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices?.[0]?.delta;
  if (delta?.content) process.stdout.write(delta.content);
  if (delta?.tool_calls) {
    // Assemble incremental tool-call fragments yourself — each delta
    // carries an `index`, optional `id`, optional `function.name`, and
    // partial `function.arguments` text to concatenate.
  }
}
```

### Tool-calling errors

```ts
import { ModelNotSupportedError, ModelNotInScopeError } from "@wingman/sdk";

try {
  await client.chat.completions.create({ model, messages, tools });
} catch (err) {
  if (err instanceof ModelNotSupportedError) {
    // Model doesn't expose tool_calls — pick another via listToolCapable().
  } else if (err instanceof ModelNotInScopeError) {
    // API key isn't authorized for this model.
  } else {
    throw err;
  }
}
```

Both errors remain `instanceof BadRequestError` / `PermissionDeniedError`
respectively, so existing catches keep working.

### Errors

All API errors extend `APIError`, which extends `WingmanError`:

```ts
import {
  APIError,
  AuthenticationError,
  RateLimitError,
} from "@wingman/sdk";

try {
  await client.chat.create({ sessionKey: "s", message: "hi" });
} catch (err) {
  if (err instanceof AuthenticationError) console.error("Bad key");
  else if (err instanceof RateLimitError) console.error("Slow down");
  else if (err instanceof APIError) console.error(err.status, err.message);
  else throw err;
}
```

Status-to-class map: `400 BadRequestError`, `401 AuthenticationError`,
`403 PermissionDeniedError`, `404 NotFoundError`, `409 ConflictError`,
`422 UnprocessableEntityError`, `429 RateLimitError`, `5xx InternalServerError`.
Network failures surface as `APIConnectionError` / `APIConnectionTimeoutError`.

## Client options

```ts
new Wingman({
  apiKey: "wm_...",                                // required (or WINGMAN_API_KEY)
  baseURL: "https://wingman.example.com",           // required (or WINGMAN_BASE_URL)
  timeout: 60_000,                                  // ms per request
  maxRetries: 2,                                    // retries 408/409/429/5xx + network
  defaultHeaders: { "X-Trace": "abc" },
  fetch: globalThis.fetch,                          // override (e.g. undici)
  logger: console,                                  // default: silent
});
```

## Smoke test

```bash
WINGMAN_API_KEY=wm_... node tests/smoke.mjs
```

## License

MIT
