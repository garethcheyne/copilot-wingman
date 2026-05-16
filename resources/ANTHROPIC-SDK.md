# Anthropic TypeScript SDK — Research Notes

Reference source: `resources/anthropic-sdk-typescript/` (gitignored shallow clone of
[anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript)).

These are working notes captured while reading the Anthropic SDK so we can mirror
the bits that matter for a **Wingman SDK** (`@wingman/sdk` or similar) that wraps our
own proxy at `https://wingman.err403.com` / `http://localhost:3200`.

---

## 1. Public API shape (what consumers see)

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Non-streaming
const msg = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

// Streaming (low-level async iterator)
const stream = await client.messages.create({ ..., stream: true });
for await (const event of stream) { /* ... */ }

// Streaming (high-level helper)
const helper = client.messages.stream({ ... });
helper.on('text', (delta) => process.stdout.write(delta));
const final = await helper.finalMessage();

// Other resources
await client.models.list();
await client.models.retrieve('claude-opus-4-6');
```

**Wingman equivalent we want:**

```ts
import Wingman from '@wingman/sdk';

const client = new Wingman({
  apiKey: process.env.WINGMAN_API_KEY,        // wm_...
  baseURL: 'https://wingman.err403.com',      // optional
});

await client.health.check();                  // GET /api/health
await client.models.list();                   // GET /api/models
const reply = await client.chat.create({      // POST /api/chat
  sessionKey: 'cli-1',
  message: 'hello',
  model: 'claude-sonnet-4.6',                 // optional, server picks default
});
const stream = await client.chat.create({ ..., stream: true });
for await (const chunk of stream) { /* ... */ }
```

---

## 2. File layout (Anthropic SDK)

```
src/
├── index.ts             # public re-exports; `export { Anthropic as default }`
├── client.ts            # BaseAnthropic + Anthropic (1.6k LOC, the engine)
├── version.ts           # SDK version constant
├── resource.ts          # @deprecated shim → core/resource
├── api-promise.ts       # @deprecated shim → core/api-promise
├── streaming.ts         # @deprecated shim → core/streaming
├── error.ts             # @deprecated shim → core/error
├── core/
│   ├── resource.ts      # abstract APIResource { _client }
│   ├── api-promise.ts   # APIPromise<T> extends Promise<T>
│   ├── streaming.ts     # Stream<Item> async-iterable + Stream.fromSSEResponse
│   ├── error.ts         # APIError hierarchy + APIError.generate()
│   ├── pagination.ts    # Page / PagePromise
│   ├── uploads.ts       # toFile() etc.
│   └── credentials.ts   # AccessTokenProvider types
├── internal/
│   ├── headers.ts       # buildHeaders([...]) merge helper
│   ├── parse.ts         # defaultParseResponse, WithRequestID
│   ├── request-options.ts
│   ├── shims.ts         # getDefaultFetch(), ReadableStream polyfills
│   ├── decoders/line.ts # LineDecoder, findDoubleNewlineIndex (SSE framing)
│   ├── detect-platform.ts
│   └── utils/...        # values, query, sleep, log, uuid, bytes, path tag
├── resources/
│   ├── index.ts         # re-exports each resource class
│   ├── messages/        # the big one — messages.ts + batches.ts
│   ├── models.ts
│   ├── completions.ts
│   ├── beta/
│   └── shared.ts
├── helpers/             # message-stream, zod helpers, json-schema
└── lib/                 # credentials, parser
```

**Key design idea:** the `client.ts` is the engine; every endpoint lives in
`resources/*.ts` as a small class that calls `this._client.get(...)` /
`this._client.post(...)`. Everything else (errors, streams, promises, headers,
parsing) is in `core/` and `internal/`.

---

## 3. The client (engine)

[`src/client.ts`](resources/anthropic-sdk-typescript/src/client.ts)

### Two-level class

```ts
export class BaseAnthropic {
  apiKey: string | null;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  fetch: Fetch;
  logger: Logger;

  constructor(opts: ClientOptions = {}) { /* resolves env vars, defaults */ }

  // HTTP verbs return APIPromise (so callers can `.then()` or `.withResponse()`)
  get<R>(path, opts?): APIPromise<R>
  post<R>(path, opts?): APIPromise<R>
  patch / put / delete

  // The whole pipeline
  private async makeRequest(opts, retriesRemaining, retryOfLogID): Promise<APIResponseProps>
  async buildRequest(opts, {retryCount}): { req, url, timeout }
  protected async prepareRequest(req, {url, options}): void   // hook for auth-derived headers
  async fetchWithTimeout(url, req, timeout, controller): Promise<Response>
  private retryRequest(...)
}

export class Anthropic extends BaseAnthropic {
  completions = new API.Completions(this);
  messages    = new API.Messages(this);
  models      = new API.Models(this);
  beta        = new API.Beta(this);
}
```

### Constructor options (`ClientOptions`)

| Option | Default | Notes |
|--------|---------|-------|
| `apiKey` | `process.env.ANTHROPIC_API_KEY` | Optional if `authToken` / `credentials` given |
| `authToken` | env | OAuth path |
| `baseURL` | env or `https://api.anthropic.com` | |
| `timeout` | 10 minutes | per-request, ms |
| `maxRetries` | `2` | exponential backoff on 408/409/429/5xx + network errors |
| `fetch` | `Shims.getDefaultFetch()` | injectable; we'll do the same |
| `fetchOptions` | — | merged into every `RequestInit` |
| `defaultHeaders` / `defaultQuery` | — | merged into every request |
| `logger` / `logLevel` | `console` / `'warn'` | |
| `dangerouslyAllowBrowser` | `false` | refuses to instantiate in browser otherwise |

### Request pipeline (the part we should copy verbatim in spirit)

```
methodRequest(method, path, opts)
   └─ request(opts) → new APIPromise(this, makeRequest(opts))
       └─ makeRequest(opts, retriesRemaining)
            1. await prepareOptions(opts)           // hook
            2. { req, url, timeout } = buildRequest(opts, {retryCount})
                 - buildURL(path, query, defaultBaseURL)
                 - buildBody({ options })           // json/form/stream
                 - buildHeaders({ options, method, bodyHeaders, retryCount })
                     • Accept: application/json
                     • User-Agent: ...
                     • X-Stainless-Retry-Count
                     • X-Stainless-Timeout
                     • anthropic-version: 2023-06-01
                     • authHeaders(options)         // x-api-key OR Authorization
                     • defaultHeaders ∘ bodyHeaders ∘ options.headers
            3. await prepareRequest(req, {url, options})   // hook
            4. fetchWithTimeout(url, req, timeout, controller)
            5. if response is Error → retry or throw APIConnectionError
            6. if !response.ok → APIError.generate(status, body, msg, headers)
                                 → may retry (shouldRetry → backoff)
            7. defaultParseResponse(client, props)
                 - stream → Stream.fromSSEResponse(response, controller, client)
                 - json   → response.json()
                 - other  → response.text() / null
            8. addRequestID(parsed, response)
```

### Retry policy

`shouldRetry()` retries on `408 / 409 / 429 / 5xx` and connection errors.
Backoff: respects `Retry-After` / `Retry-After-Ms` headers, otherwise
exponential. Adds `X-Stainless-Retry-Count` header so the server sees the
attempt number.

---

## 4. APIPromise — the lazy response wrapper

[`src/core/api-promise.ts`](resources/anthropic-sdk-typescript/src/core/api-promise.ts)

```ts
class APIPromise<T> extends Promise<WithRequestID<T>> {
  // resolves to parsed body by default
  asResponse(): Promise<Response>                  // raw Response
  withResponse(): Promise<{ data, response, request_id }>
  _thenUnwrap<U>(fn): APIPromise<U>                // chainable transform
}
```

**Trick:** the base `Promise`'s executor is a no-op; `.then` / `.catch` /
`.finally` are overridden to lazily call `parseResponse(client, props)`.
This lets `.asResponse()` skip parsing entirely.

---

## 5. Streaming

[`src/core/streaming.ts`](resources/anthropic-sdk-typescript/src/core/streaming.ts)

```ts
class Stream<Item> implements AsyncIterable<Item> {
  controller: AbortController;

  static fromSSEResponse<Item>(response, controller, client?): Stream<Item> {
    async function* iterator() {
      for await (const sse of _iterSSEMessages(response, controller)) {
        if (sse.event === 'ping') continue;
        if (sse.event === 'error') throw APIError.generate(...);
        if (knownEvent(sse.event)) yield JSON.parse(sse.data) as Item;
      }
    }
    return new Stream(iterator, controller, client);
  }

  tee(): [Stream<Item>, Stream<Item>]
  toReadableStream(): ReadableStream
}
```

- SSE framing uses `LineDecoder` + `findDoubleNewlineIndex` to split on `\n\n`.
- Errors mid-stream are thrown into the iterator.
- `controller.abort()` cancels the underlying fetch.

A **high-level helper** lives separately in `helpers/`: `MessageStream`
exposes `.on('text', cb)`, `.on('message', cb)`, `.finalMessage()`,
`.toReadableStream()`. We probably want one too: a `ChatStream` that emits
`'delta'` and `.finalText()`.

---

## 6. Errors

[`src/core/error.ts`](resources/anthropic-sdk-typescript/src/core/error.ts)

```
Error
└── AnthropicError                       // base class for "this SDK"
    └── APIError                         // anything HTTP
        ├── APIConnectionError           // network/no-status
        │    └── APIConnectionTimeoutError
        ├── APIUserAbortError            // signal aborted
        ├── BadRequestError              // 400
        ├── AuthenticationError          // 401
        ├── PermissionDeniedError        // 403
        ├── NotFoundError                // 404
        ├── ConflictError                // 409
        ├── UnprocessableEntityError     // 422
        ├── RateLimitError               // 429
        └── InternalServerError          // 5xx
```

Each carries `status`, `headers`, `error` (parsed body), `requestID` (from
`request-id` response header), and `type` (the `error.type` string from the
body, e.g. `rate_limit_error`).

`APIError.generate(status, body, msg, headers)` is a static factory that picks
the right subclass — we should do the same.

---

## 7. Resources pattern

[`src/core/resource.ts`](resources/anthropic-sdk-typescript/src/core/resource.ts)

```ts
export abstract class APIResource {
  protected _client: BaseAnthropic;
  constructor(client: BaseAnthropic) { this._client = client; }
}
```

Example: [`src/resources/models.ts`](resources/anthropic-sdk-typescript/src/resources/models.ts)

```ts
export class Models extends APIResource {
  retrieve(id, params?, options?): APIPromise<ModelInfo> {
    return this._client.get(path`/v1/models/${id}`, { ...options });
  }
  list(params?, options?): PagePromise<ModelInfosPage, ModelInfo> {
    return this._client.getAPIList('/v1/models', Page<ModelInfo>, { query, ...options });
  }
}
```

Example: [`src/resources/messages/messages.ts`](resources/anthropic-sdk-typescript/src/resources/messages/messages.ts) — `create()` is overloaded:

```ts
create(body: CreateParamsNonStreaming, opts?): APIPromise<Message>;
create(body: CreateParamsStreaming,    opts?): APIPromise<Stream<RawMessageStreamEvent>>;
create(body: CreateParamsBase,         opts?): APIPromise<Stream | Message>;
create(body, options?) {
  return this._client.post('/v1/messages', {
    body,
    timeout: ...,
    ...options,
    headers: buildHeaders([helperHeader, options?.headers]),
    stream: body.stream ?? false,        // ← engine reads this to pick parser
  }) as APIPromise<Message> | APIPromise<Stream<...>>;
}
```

Overload trick: `stream: true` in params → return type narrows to `Stream<...>`.

---

## 8. Auth

`authHeaders(options)` injects either:

- `x-api-key: <apiKey>` (default, the dominant path)
- `Authorization: Bearer <oauth-token>` (OAuth/credentials path)

There's a `prepareRequest` hook that adds the `anthropic-beta` OAuth header
*after* all merging when the token cache is active.

Wingman is simpler — we have one shape: `Authorization: Bearer wm_...`.
Optional fallback: `x-api-key: wm_...` (the proxy accepts both per
[`proxy/src/middleware/chat-auth.ts`](proxy/src/middleware/chat-auth.ts)).

---

## 9. What to mirror for `@wingman/sdk`

### Must-have

- `Wingman` class with `{ apiKey, baseURL, timeout, maxRetries, fetch, defaultHeaders, logger }`.
- Two-level split: `BaseWingman` (engine) + `Wingman` (assembles resources).
- `APIResource` base + one resource per endpoint group:
  - `client.health` → `GET /api/health`
  - `client.models` → `GET /api/models`
  - `client.chat`   → `POST /api/chat` (with streaming overload)
- `APIPromise<T>` with `.asResponse()` / `.withResponse()`.
- `Stream<T>` over SSE with `AbortController`, `for await`, `.tee()`.
- Error hierarchy: `WingmanError → APIError → {BadRequest, Authentication, PermissionDenied, NotFound, RateLimit, InternalServer, APIConnectionError, APIUserAbortError}`. Static `APIError.generate(status, body, msg, headers)`.
- Retries with exponential backoff (default 2), respect `Retry-After`.
- Injectable `fetch` (so we can polyfill in Node 16, use undici, etc.). Node 18+ ships native fetch.
- Bearer auth via `authHeaders()`.
- `X-Wingman-Retry-Count` debug header (handy for log correlation).

### Should-have

- `withOptions(partial)` → returns a cloned client with overrides (e.g. different timeout for one call).
- Per-call `RequestOptions` (headers, query, signal, timeout, maxRetries).
- High-level `client.chat.stream(params)` helper analogous to `MessageStream`: emits `'delta'` (text), `'done'` (full string), and exposes `.finalText()`.
- Logger with levels (`debug` / `info` / `warn` / `error`).

### Nice-to-have / skip for v1

- Pagination (`PagePromise`) — our `/api/models` returns a flat array; defer.
- Beta/preview resource ladder — skip.
- File uploads / multipart — skip until we need image uploads via SDK.
- Credential chain / OAuth — skip; single Bearer token.
- Stainless code generation — handwrite the v1.

---

## 10. Proposed Wingman SDK skeleton

```
packages/wingman-sdk/
├── package.json                  # name: @wingman/sdk, type: module
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                  # export { Wingman as default, ... }
│   ├── client.ts                 # BaseWingman + Wingman
│   ├── version.ts
│   ├── core/
│   │   ├── resource.ts           # APIResource
│   │   ├── api-promise.ts        # APIPromise<T>
│   │   ├── streaming.ts          # Stream<Item> + SSE iterator
│   │   ├── error.ts              # error hierarchy + APIError.generate
│   │   └── request-options.ts
│   ├── internal/
│   │   ├── headers.ts            # buildHeaders([...])
│   │   ├── parse.ts              # defaultParseResponse
│   │   └── decoders/line.ts      # SSE line decoder
│   ├── resources/
│   │   ├── index.ts
│   │   ├── health.ts             # client.health.check()
│   │   ├── models.ts             # client.models.list()
│   │   └── chat.ts               # client.chat.create() + .stream()
│   └── helpers/
│       └── chat-stream.ts        # high-level stream emitter
└── tests/
    ├── client.test.ts
    ├── chat.test.ts              # non-stream + stream
    └── errors.test.ts            # 401/403/404/429/5xx mapping
```

Public surface v1:

```ts
const wingman = new Wingman({ apiKey: 'wm_...' });

await wingman.health.check();                              // { status: 'ok' }
const models = await wingman.models.list();                // string[] or {id}[]

// Non-streaming
const reply = await wingman.chat.create({
  sessionKey: 'session-1',
  message: 'Hello',
  model: 'claude-sonnet-4.6',
});
// reply.choices[0].message.content

// Streaming (low-level)
const stream = await wingman.chat.create({ ..., stream: true });
for await (const event of stream) { /* OpenAI-style chunk objects */ }

// Streaming (helper)
const s = wingman.chat.stream({ sessionKey, message });
s.on('delta', (text) => process.stdout.write(text));
const full = await s.finalText();
```

---

## 11. Open questions / decisions to make

1. **Module system** — ESM-only (modern Node) or dual (CJS+ESM)? Anthropic ships dual via `tsc-multi`. v1: ESM-only is simpler.
2. **Browser support** — explicit opt-in (`dangerouslyAllowBrowser`) or just allow it? The proxy stores keys server-side, so a browser flag should default-warn but not throw. Different threat model from Anthropic.
3. **Types source of truth** — handwrite, or generate from `resources/openapi-llmstatus.json`? Handwrite v1, switch to codegen later.
4. **Response shape** — match Anthropic's `Message` (content blocks) or OpenAI's `choices[0].message.content`? The proxy currently emits OpenAI-style, so mirror that.
5. **`sessionKey` placement** — body param (current proxy) or SDK-managed session object (`client.sessions.create()` → `session.send(...)`)? The latter is nicer DX; keep the body field for now and revisit.
6. **Package layout** — top-level `packages/wingman-sdk/` (monorepo) or sibling `sdk/`? Monorepo will help if we ever ship a Python sibling.
7. **Publishing** — `@wingman/sdk` on npm, or scoped to a private registry first?

---

## 12. Concrete next step

Pick one:

- **(a)** Scaffold `packages/wingman-sdk/` with `client.ts`, error hierarchy, `Stream`, and the three resources (health/models/chat) — handwritten, no codegen, ESM-only, Node 18+, `tsup` build, `vitest` tests. ~half day.
- **(b)** First write `resources/openapi-llmstatus.json` updates so the SDK can be generated later, then do (a).
- **(c)** Smaller v0: ship just `client.chat.create()` + `client.chat.stream()` + auth + error mapping as a single-file `wingman.ts` that the web/admin UI can consume internally; promote to a package later.
