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
