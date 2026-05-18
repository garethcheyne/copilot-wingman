# Plan — Tool Calling Support for Wingman

> **Status:** Proposed
> **Target version:** `proxy` v?.? · `@wingman/sdk` v0.2.0
> **Author:** drafted by Copilot on behalf of @garethcheyne
> **Driver:** [NextDocs](https://github.com/garethcheyne/nextdocs) wants to replace `@anthropic-ai/sdk` with `@wingman/sdk`. NextDocs's Alice agent depends on **tool/function calling**, which the current Wingman SDK v0.1 doesn't expose.

---

## 1. Background

### 1.1 Where Wingman is today

The current public surface is a deliberately small chat proxy:

```
POST /api/chat                  { sessionKey, message, systemPrompt?, model?, stream? }
GET  /api/models                → list of models
GET  /api/health                → { status }
```

Conversation state is **server-managed** in `chat_sessions` / `chat_messages`, keyed by `sessionKey`. The proxy speaks GitHub Copilot's `/chat/completions` (OpenAI-compatible) and `/responses` endpoints upstream and **already stores every model's full capabilities blob** in `upstream_models.capabilities` — including the `supports.tool_calls`, `supports.parallel_tool_calls`, `supports.streaming`, `supports.vision`, `supports.structured_outputs` flags.

### 1.2 What's missing for tool-calling consumers

OpenAI-style tool calling needs:
- Caller can pass `tools` (function schemas) and `tool_choice`.
- Assistant turns may contain `tool_calls` (not just text content).
- Caller appends a synthetic `role: "tool"` message with the function result.
- Multi-turn loop is **client-managed** — server can't persist arbitrary tool messages cleanly under the current `chat_messages` schema (`role IN ('system','user','assistant')`).

Forcing tool-calling through the existing session-managed `/api/chat` would conflate two concepts. Cleaner to add a sibling endpoint that mirrors OpenAI's shape directly.

---

## 2. Goals & non-goals

### Goals
1. Add **`POST /api/chat/completions`** — stateless, OpenAI-compatible, supports `tools` / `tool_choice` / `tool_calls`, streaming and non-streaming.
2. Expose **per-model capability discovery** in the SDK so callers can ask "which models support `tool_calls`?" before picking one.
3. Ship Node SDK **v0.2.0** with a new `client.chat.completions.create()` resource that mirrors `openai-node` shape closely enough that existing code drops in.
4. Keep **all existing endpoints and SDK methods backwards-compatible**. v0.1 callers see no change.

### Non-goals (this iteration)
- No streaming `tool_calls` delta reconstruction helper in the SDK — callers consuming the raw stream can assemble deltas themselves (matches OpenAI SDK behaviour).
- No tool-result storage in `chat_messages` (would require schema migration; not needed when callers manage history).
- No Python / .NET SDK parity — Node first, port others after the Node SDK stabilises.
- No upstream `/responses` API tool-call translation. v0.2 only supports tool calling on models whose `supported_endpoints` includes `/chat/completions`. Models that are `/responses`-only return `400 model_does_not_support_tools`.

---

## 3. Discovery: which models support tools?

### 3.1 Data we already have

`upstream_models.capabilities` JSONB stores the upstream Copilot capabilities blob. Concrete examples seen in the wild:

```jsonc
// gpt-4o
{
  "type": "chat",
  "family": "gpt-4o",
  "tokenizer": "o200k_base",
  "limits": { "max_context_window_tokens": 128000, "max_output_tokens": 16384 },
  "supports": {
    "streaming": true,
    "tool_calls": true,
    "parallel_tool_calls": true,
    "vision": true,
    "structured_outputs": true
  }
}

// claude-sonnet-4.6
// NOTE: Copilot's upstream capability blob reports `parallel_tool_calls: false`
// for Claude, but this is downstream-inaccurate — the model actually emits
// multiple tool_calls per turn; Copilot's transport just leaks Anthropic's
// multi-content-block shape as sibling indexless `choices[]`. Wingman's
// `normalizeChatCompletion()` collapses that into the OpenAI-standard
// single-choice form, so parallel tool calls DO work end-to-end via Wingman.
{
  "type": "chat",
  "family": "claude-sonnet-4.6",
  "supports": {
    "streaming": true,
    "tool_calls": true,
    "parallel_tool_calls": false,
    "vision": true
  }
}

// some older / embedding models
{
  "type": "embeddings",
  "supports": { "streaming": false }
}
```

The `formatModel()` helper in `proxy/src/routes/models.ts` already passes `capabilities.supports` through to the API response. Good — nothing to add in the data layer.

### 3.2 What we need to add

**API filtering.** Today `GET /api/models` returns every active model assigned to the caller's API key. Add an optional query string:

```
GET /api/models?supports=tool_calls
GET /api/models?supports=tool_calls,vision         # AND (must support both)
GET /api/models?endpoint=/chat/completions         # only models on a given upstream endpoint
GET /api/models?chat_only=true                     # convenience: chat_enabled=true
```

Filter logic runs server-side **after** the existing API-key scope check, so an API key can't widen its scope via filter params.

**Convenience flag in response.** Add a top-level `supports_tools: boolean` on each model in the formatted response — flattened from `capabilities.supports.tool_calls` so SDK consumers don't have to drill into nested objects.

### 3.3 SDK surface

```ts
// existing
await client.models.list();

// new
await client.models.list({ supports: "tool_calls" });
await client.models.list({ supports: ["tool_calls", "vision"] });

// each Model gains:
interface Model {
  id: string;
  name: string;
  vendor: string;
  // ...
  supports_tools: boolean;                  // ← convenience, flattened
  capabilities: {
    type: "chat" | "embeddings" | string;
    family: string;
    context_window: number | null;
    max_output_tokens: number | null;
    supports: {
      streaming?: boolean;
      tool_calls?: boolean;
      parallel_tool_calls?: boolean;
      vision?: boolean;
      structured_outputs?: boolean;
    };
  } | null;
}
```

A small helper for ergonomics:

```ts
// returns just the ids of tool-capable models
const ids = await client.models.listToolCapable();
```

---

## 4. New endpoint: `POST /api/chat/completions`

### 4.1 Shape (OpenAI-compatible subset)

**Request body:**
```ts
{
  model: string,                              // required — must be in caller's scopes
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool",
    content: string | Array<                  // multi-part for vision
      | { type: "text", text: string }
      | { type: "image_url", image_url: { url: string } }
    > | null,                                 // assistant tool-call turns may have null content
    name?: string,                            // optional, OpenAI-spec
    tool_call_id?: string,                    // required when role === "tool"
    tool_calls?: Array<{                      // present on assistant turns that invoked tools
      id: string,
      type: "function",
      function: { name: string, arguments: string }   // arguments is a JSON-encoded string
    }>
  }>,
  tools?: Array<{
    type: "function",
    function: {
      name: string,
      description?: string,
      parameters: object                      // JSON Schema
    }
  }>,
  tool_choice?: "auto" | "none" | "required" | { type: "function", function: { name: string } },
  parallel_tool_calls?: boolean,              // default true (when model supports it)
  temperature?: number,
  top_p?: number,
  max_tokens?: number,
  stream?: boolean,                           // default false
  user?: string                               // pass-through identifier
}
```

**Non-streaming response (mirrors OpenAI):**
```ts
{
  id: string,                                 // wm-cmpl-<uuid>
  object: "chat.completion",
  created: number,                            // unix seconds
  model: string,
  choices: [{
    index: 0,
    message: {
      role: "assistant",
      content: string | null,
      tool_calls?: [{ id, type: "function", function: { name, arguments } }]
    },
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter"
  }],
  usage: { prompt_tokens, completion_tokens, total_tokens }
}
```

**Streaming response:** SSE with OpenAI-shaped delta chunks, including `delta.tool_calls[]` deltas (each carrying `index`, optional `id`, optional `function.name`, incremental `function.arguments` chunks). Terminate with `data: [DONE]`.

### 4.2 Error model

| HTTP | `error.code`                | When |
|------|-----------------------------|------|
| 400  | `invalid_request`           | missing model, missing messages, schema invalid |
| 400  | `model_does_not_support_tools` | `tools` provided but model's `supports.tool_calls !== true` |
| 400  | `model_endpoint_unsupported`  | model is `/responses`-only (no tool support in v0.2) |
| 401  | `authentication_required`   | missing / bad API key |
| 403  | `model_not_in_scope`        | model not in caller's API-key `scopes[]` |
| 429  | `rate_limit_exceeded`       | per-key rate limit hit |
| 500  | `upstream_error`            | Copilot API returned non-2xx |
| 504  | `upstream_timeout`          |  |

Error body:
```json
{ "error": { "code": "model_does_not_support_tools", "message": "Model 'gpt-3.5-turbo' does not support tool calling.", "param": "tools" } }
```

### 4.3 Auth, scopes, rate-limiting, logging

- Reuse the existing `apiKeyAuth` middleware verbatim.
- Reuse `scopes[]` enforcement — model must appear in the key's allowed list (or internal/UI key bypass).
- Reuse `rate_limit` per key (requests/min).
- Log every call to `request_log` exactly like `/api/chat` does:
  - `session_id` → **NULL** (stateless endpoint)
  - `api_key_id`, `source = 'api_key' | 'ui'`
  - `model`, `prompt_tokens`, `completion_tokens`, `latency_ms`, `status`, `error_message`
- Tool-related counters (tool calls emitted, tool-call rounds) — optional v0.3 enhancement; not required for v0.2.

### 4.4 Server-side validation rules

Before calling upstream:
1. `model` is provided and (for API-key callers) ∈ `apiKey.scopes`.
2. If `tools.length > 0`:
   - Look up model's `capabilities.supports.tool_calls`. If false/missing → 400 `model_does_not_support_tools`.
   - Look up `supported_endpoints`. If `/chat/completions` not in the list → 400 `model_endpoint_unsupported`.
3. If any message has `role: "tool"`:
   - `tool_call_id` is required.
   - There must be a preceding assistant message with a matching `tool_calls[].id`.
4. If `tool_choice` is `"required"` but `tools` is empty → 400.
5. Cap inbound payload size (existing global `express.json()` limit applies).

### 4.5 Upstream wiring

In `proxy/src/services/copilot-client.ts` add a new function:

```ts
export interface RawChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  parallel_tool_calls?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

export async function chatCompletionRaw(req: RawChatRequest): Promise<UpstreamChatResponse>;
export async function chatCompletionStreamRaw(req: RawChatRequest): Promise<ReadableStream<Uint8Array>>;
```

Pass `tools`, `tool_choice`, `parallel_tool_calls` straight through to `/chat/completions`. Surface the full upstream response (`choices[0].message` including `tool_calls`, plus `usage`) back to the route.

> Keep the existing `chatCompletion()` / `chatCompletionStream()` returning `string` / `ReadableStream` for the legacy session-managed `/api/chat` route — don't refactor that surface; just add the raw variants alongside.

### 4.6 Token accounting for streaming + tool calls

`tokenizer.countMessageTokens()` currently handles plain string content. Extend it to:
- Sum tokens for OpenAI-format `tool_calls` (count `function.name` + `function.arguments` JSON string).
- Sum tokens for `role: "tool"` message content.
- Sum tokens for `tools[]` schemas (count the stringified JSON of each `tools[i].function`).

This keeps `prompt_tokens` honest in `request_log` so usage analytics don't undercount.

---

## 5. SDK v0.2.0 changes

### 5.1 New resource: `client.chat.completions`

```ts
// new — OpenAI-compatible, stateless
const res = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Find docs about widget X." }
  ],
  tools: [{
    type: "function",
    function: {
      name: "search_docs",
      description: "Full-text search the docs corpus.",
      parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }
    }
  }],
  tool_choice: "auto"
});

// res.choices[0].message.tool_calls?: [{ id, type, function: { name, arguments } }]
// res.choices[0].finish_reason === "tool_calls"  → caller runs the tool, appends a `role: "tool"` message, calls again

// Streaming variant returns Stream<ChatCompletionChunk>
const stream = await client.chat.completions.create({ ..., stream: true });
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  if (delta?.content) process.stdout.write(delta.content);
  if (delta?.tool_calls) { /* assemble tool-call delta */ }
}
```

### 5.2 New resource: `client.models.list({ supports })` + helper

```ts
await client.models.list();                                    // unchanged
await client.models.list({ supports: "tool_calls" });
await client.models.list({ supports: ["tool_calls", "vision"] });
await client.models.listToolCapable();                         // shortcut
```

### 5.3 Error class additions

Extend the existing typed hierarchy:
- `ModelNotSupportedError extends BadRequestError` — thrown for `model_does_not_support_tools` and `model_endpoint_unsupported`.
- `ModelNotInScopeError extends PermissionDeniedError` — thrown for `model_not_in_scope`.

Both must remain `instanceof APIError` / `WingmanError` so existing catches still work.

### 5.4 Types

Add `src/resources/chat-completions.ts` exporting:
- `ChatCompletionCreateParams`
- `ChatCompletionMessage`
- `ChatCompletionTool`, `ChatCompletionToolChoice`
- `ChatCompletion`, `ChatCompletionChoice`, `ChatCompletionMessageToolCall`
- `ChatCompletionChunk`, `ChatCompletionChunkChoiceDelta`, `ChatCompletionMessageToolCallDelta`

All named to match `openai-node` so type-aliases work for migration:

```ts
import type { ChatCompletion as OpenAIChatCompletion } from "openai/resources/chat/completions";
import type { ChatCompletion as WingmanChatCompletion } from "@wingman/sdk";
// Structurally interchangeable for 95% of use cases.
```

### 5.5 Backwards compatibility

- `client.chat.create()` and `client.chat.stream()` stay byte-for-byte unchanged.
- `client.models.list()` keeps returning the same shape **plus** new optional fields (`supports_tools`, `capabilities.supports`). Adding optional fields is a non-breaking change.
- `Wingman` constructor signature unchanged.

---

## 6. Tests

### 6.1 Proxy (`proxy/tests/`)

- [ ] `chat-completions.basic.test.ts` — happy path, no tools, non-streaming.
- [ ] `chat-completions.tools.test.ts` — caller passes `tools`, assistant returns `tool_calls`, caller submits `role: "tool"` message, assistant returns final text.
- [ ] `chat-completions.streaming.test.ts` — SSE deltas, including `tool_calls` deltas.
- [ ] `chat-completions.validation.test.ts` — 400 cases for missing model, empty messages, `tools` with non-tool-capable model, orphan `role: "tool"` message.
- [ ] `chat-completions.scope.test.ts` — 403 when model is outside API-key scope.
- [ ] `chat-completions.usage-logging.test.ts` — `request_log` row created with correct `prompt_tokens`, `completion_tokens`, `latency_ms`, `status`, `api_key_id`, `source`.
- [ ] `models.filter.test.ts` — `?supports=tool_calls` filters out non-tool-capable models; AND-semantics for multi-value filter; doesn't widen API-key scope.

### 6.2 SDK (`sdk/node/tests/`)

- [ ] `chat-completions.smoke.mjs` — round-trip against a live proxy.
- [ ] `chat-completions.tools.mjs` — full tool-call loop with a stub tool.
- [ ] `chat-completions.stream.mjs` — assemble streamed `tool_calls` deltas into a final tool call.
- [ ] `models.list.filter.mjs` — `supports` filter, `listToolCapable()`.
- [ ] `errors.test.mjs` — assert `ModelNotSupportedError` is `instanceof BadRequestError`.

---

## 7. Documentation

### 7.1 SDK README (`sdk/node/README.md`)

Add a `## Tool calling` section showing:
1. Discover tool-capable models with `listToolCapable()`.
2. Full non-streaming tool-call loop.
3. Streaming + assembling deltas.
4. Error handling for `ModelNotSupportedError`.

### 7.2 SDK design doc (`sdk/README.md`)

Add `POST /api/chat/completions` to the "Endpoints covered" table and bump version to `v0.2`.

### 7.3 Top-level README

Under **Features**, add: "OpenAI-compatible chat completions API with tool/function calling for tool-capable models".

### 7.4 PLAN.md / TODO.md

Mark this work item in the project plan files.

### 7.5 Migration note

Document the rule: `model.capabilities.supports.tool_calls === true` ↔ `model.supports_tools === true`. Either is fine to check; the flat one is preferred for new code.

---

## 8. Release & versioning

- Proxy: no breaking change to existing endpoints. Bumps `VERSION` (root) by patch or minor — pick `0.2.0` to align with SDK.
- SDK: **`@wingman/sdk` v0.2.0**. Drop a fresh GitHub release tag `sdk-node-v0.2.0` with the prebuilt tarball, matching the existing release process used for v0.1.0.
- `upgradeWingman.sh` users get the new endpoint after the next `git pull` + container rebuild — **no DB migration required** (we're only reading existing `capabilities` data).

---

## 8a. Smart model routing (traffic-controller behaviour)

Wingman's value proposition isn't just "API translator" — it's the **traffic
controller** sitting between caller apps and Copilot's catalog. This section
adds capability-aware routing as a first-class feature of v0.2.

### 8a.1 Problem

Today every caller hardcodes `model: "claude-sonnet-4.6"` (or similar) in its
request. The model choice is bound at app deploy time. Consequences:

- App can't take advantage of newly-added or newly-tool-capable models without a
  redeploy.
- App can't pick the *cheapest* model for the task — a classification call that
  doesn't need tools still hits Claude.
- No way to ration premium-request quota across multiple consumers.

### 8a.2 Routing primitive

Extend the request body of `POST /api/chat/completions` (and `POST /api/chat`)
with an optional `routing` field:

```ts
routing?: {
  model?: string;                           // exact model id (existing behaviour)
  prefer?: "quality" | "speed" | "cost" | "parallel_tools";
  requires?: Array<                         // hard filters
    | "tool_calls"
    | "parallel_tool_calls"
    | "vision"
    | "structured_outputs"
    | "streaming"
  >;
  exclude?: string[];                       // model ids never to pick
  fallback?: string[];                      // ordered preference list
}
```

Resolution rules at the proxy:

1. If `routing.model` is set → use it (after scope & capability validation).
2. Else, compute the candidate set = caller's API-key `scopes[]` ∩ active models
   ∩ `requires[]` filter ∩ `NOT IN exclude[]`.
3. Apply `prefer`:
   - `quality`: rank by `capabilities.tier` (a new column populated from
     `llm_stats`) descending.
   - `speed`: rank by recent p50 latency in `request_log`.
   - `cost`: rank by `input_price_per_m + output_price_per_m`, ascending; ties
     broken by `premium_multiplier` (0 = included → preferred).
   - `parallel_tools`: filter to `supports.parallel_tool_calls = true` first,
     then rank by quality.
4. If candidate set is empty, return `400 no_matching_model` with the failed
   constraints in the error body so the caller can degrade.

### 8a.3 Persistence: routing policies per API key

New table:

```sql
CREATE TABLE IF NOT EXISTS routing_policies (
  api_key_id UUID PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
  default_prefer VARCHAR(20),                -- 'quality' | 'speed' | 'cost' | 'parallel_tools'
  default_requires TEXT[] NOT NULL DEFAULT '{}',
  default_exclude TEXT[] NOT NULL DEFAULT '{}',
  default_fallback TEXT[] NOT NULL DEFAULT '{}',
  default_model VARCHAR(100),                -- overrides the existing api_keys.default_model
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Resolution order:
1. Request-level `routing.model` →
2. Request-level `routing.prefer` + filters →
3. API-key `routing_policies` row →
4. Global `app_settings.default_model`.

### 8a.4 Admin UI

Add a "Routing" tab on the API-key detail page in the web UI:
- Pick default `prefer` mode.
- Tick required capabilities.
- Build an ordered fallback list from the model catalog.

### 8a.5 SDK surface

```ts
await client.chat.completions.create({
  model: "auto",                              // sentinel — defer to server
  routing: { prefer: "quality", requires: ["tool_calls"] },
  messages: [...],
  tools: [...]
});

// Response includes the resolved model so the caller can log it:
// res.model === "claude-sonnet-4.6" (actual)
// res.wingman?.routing_decision === { requested: "auto", picked: "claude-sonnet-4.6", reason: "prefer=quality, requires=[tool_calls]" }
```

The `wingman` envelope is a Wingman-specific addition to the OpenAI-shaped
response, namespaced so type-aliasing against `openai-node` still works.

---

## 8b. GitHub Copilot quota & multi-connection routing

### 8b.1 The problem

Wingman authenticates to Copilot via a stored OAuth token per `gh_connections`
row. Each call consumes against **that GitHub user's** monthly premium-request
quota. If a heavy consumer (e.g. an agent-based app like NextDocs's Alice)
shares the same `gh_connection` as your personal IDE, the two compete for the
same quota.

Typical Copilot plan quotas (subject to change by GitHub):

| Plan       | Premium requests / user / month | Base model |
|------------|---------------------------------|------------|
| Pro        | 300                             | unlimited  |
| Business   | 300                             | unlimited  |
| Enterprise | 1000 (admin-configurable)       | unlimited  |

Premium models include Claude, GPT-4o, o1, Gemini 2.5 Pro. The current "base"
model (GPT-4.1) is unlimited and does **not** burn premium quota.

### 8b.2 v0.2 deliverables (this plan)

- **Show premium-multiplier in `/api/models`** — already stored on
  `upstream_models.premium_multiplier`; flatten into the formatted response so
  SDK callers can see "this model costs 1 premium request per call".
- **Quota usage in admin UI** — running counter of premium requests per
  `gh_connection` per calendar month, computed from `request_log` × the
  model's `premium_multiplier`.
- **Threshold alerts** — `notification_channels` row fires when a connection
  crosses 50% / 80% / 100% of a configurable monthly cap.

### 8b.3 Out-of-scope but documented (v0.3 follow-up)

- **Multi-connection round-robin.** Allow > 1 `gh_connection` rows to be
  marked `active`. New `connection_id` column on `request_log`. Wingman picks
  the connection with the lowest current-month premium usage at request time,
  failing over on 401 / quota-exceeded errors.
- **Per-API-key connection pinning.** Stick an API key to a specific
  connection (e.g. NextDocs always uses the `nextdocs-svc` company account).
- **Service-account onboarding helper.** A CLI / admin-UI flow that walks an
  admin through creating a dedicated GitHub user, granting it a Copilot seat,
  and connecting it to Wingman without manual `gh_connections` SQL.

These are intentionally deferred — v0.2 ships tool calling + routing + visible
quota; v0.3 layers multi-connection rotation on top.

### 8b.4 Practical guidance (cross-link from README)

For the **NextDocs migration** specifically (the driver for this plan), the
recommended quota setup is:

1. Use a dedicated company Copilot Enterprise seat for Wingman's
   `gh_connection`, not the developer's personal account.
2. Route NextDocs's non-Alice routes (`kb/classify`, `features/analyze`,
   `regenerate-group`) at the base model — they don't need premium reasoning
   for their classification tasks. Saves ~80% of the premium-quota footprint.
3. Route Alice through Claude (premium). Cap with an `api_keys.rate_limit` so a
   runaway loop can't drain the seat's monthly quota.

---

## 8c. Honest non-features (what Wingman won't do)

To prevent expectation drift, this is the canonical list of things Wingman
**will not** do, with rationale. Mirror this into the README.

| Non-feature | Why |
|---|---|
| **Fabricate parallel tool calls when the upstream model genuinely emits one at a time.** | Model decoders decide tool-call count. Wingman cannot merge two distinct upstream responses into one synthetic assistant message without fabricating tool-call IDs the model never issued — a correctness hazard. (Note: this is distinct from `normalizeChatCompletion()`, which reshapes Copilot's malformed multi-choice envelope for Claude into the standard OpenAI single-choice form — shape-preserving, not synthetic.) |
| **Cache responses across users.** | LLM responses are not safe to share — system prompts vary, content is sensitive. (Per-session prompt caching by the *upstream* is fine and out of our control.) |
| **Modify or sanitise user content.** | Wingman is a transport-layer proxy. Content filtering belongs in the caller or in upstream guardrails. |
| **Pretend to support `/responses`-only models for tool calling in v0.2.** | The `/responses` upstream uses a different schema. Tool support there is a v0.3 item. |
| **Auto-retry tool calls in the proxy.** | Tool execution lives in the caller. The proxy cannot know whether a tool failure is retryable. |
| **Convert between vendor shapes (Anthropic ↔ OpenAI ↔ Google).** | Wingman speaks OpenAI shape because Copilot speaks OpenAI shape upstream. Callers translate at their boundary. (NextDocs's tool-schema translation is a one-time, 20-line helper.) |
| **Bypass GitHub's per-user Copilot quota.** | We're a legitimate consumer of the Copilot API. Quota is GitHub's; we surface it, we don't circumvent it. |

---

## 9. Out-of-scope follow-ups (file as separate issues)

1. **Tool-call analytics dashboard** — count of tool-call rounds per model, per API key, average tool-args size, p95 round-trip latency.
2. **Python SDK** — port `chat.completions` + `models.list(supports=...)` to `sdk/python/`.
3. **.NET SDK** — same port to `sdk/dotnet/`.
4. **Streaming tool-call assembly helper** in the SDK (similar to `chat.stream().finalText()` but yielding fully-assembled `ChatCompletionMessageToolCall[]`).
5. **`/responses` endpoint tool-call support** — `/responses` supports tools too but uses a different shape; deferred until a model becomes tools-capable on `/responses` only.
6. **`structured_outputs` / JSON-mode pass-through** — many models support `response_format: { type: "json_schema", ... }`; expose this once tool calling is stable.

---

## 10. Concrete file checklist

> Boxes for an executor to tick off. Paths are repo-relative.

### Proxy
- [ ] `proxy/src/services/copilot-client.ts` — add `Tool`, `ToolChoice`, `ToolCall`, `RawChatRequest`, `UpstreamChatResponse` types; extend `ChatMessage` to allow `role: "tool"`, `tool_call_id`, `tool_calls`, and `content: null`; add `chatCompletionRaw()` + `chatCompletionStreamRaw()` that pass `tools` / `tool_choice` / `parallel_tool_calls` through to `/chat/completions`.
- [ ] `proxy/src/services/tokenizer.ts` — extend `countMessageTokens()` to count `tool_calls`, `role: "tool"` content, and `tools[]` schemas.
- [ ] `proxy/src/services/model-sync.ts` — no changes required (capabilities already stored).
- [ ] `proxy/src/routes/chat.ts` — add **`router.post('/completions', ...)`** handler (mounted under `/api/chat`). Stateless; reuse auth + scope + rate-limit + request-log helpers.
- [ ] `proxy/src/routes/models.ts` — extend `GET /api/models` to accept `?supports=` and `?endpoint=` filters; add `supports_tools` to each returned model.
- [ ] `proxy/src/server.ts` — confirm `/completions` is mounted (no change needed if `chatRouter` already wires it).
- [ ] `proxy/tests/...` — add the seven test files listed in §6.1.

### SDK (Node)
- [ ] `sdk/node/src/resources/chat-completions.ts` — new file. Exports `ChatCompletions` class with `.create()` (overloaded for stream/non-stream); all type defs.
- [ ] `sdk/node/src/resources/chat.ts` — attach `completions` as a property on `Chat`; no removal of existing methods.
- [ ] `sdk/node/src/resources/models.ts` — extend `list()` to accept `{ supports?: string | string[]; endpoint?: string }`; serialise into query string; add `listToolCapable()` helper.
- [ ] `sdk/node/src/errors.ts` — add `ModelNotSupportedError`, `ModelNotInScopeError`; extend `errorFromStatus()` to map by `error.code` first, then fall back to HTTP status.
- [ ] `sdk/node/src/index.ts` — re-export the new types and error classes.
- [ ] `sdk/node/src/version.ts` — bump to `0.2.0`.
- [ ] `sdk/node/package.json` — bump `version` to `0.2.0`.
- [ ] `sdk/node/README.md` — new `## Tool calling` section; update version reference.
- [ ] `sdk/node/tests/...` — add the five test files listed in §6.2.

### Repo-level
- [ ] `VERSION` — bump to match.
- [ ] `PLAN.md` / `TODO.md` — tick this item off and link to the new release.
- [ ] `.github/workflows/...` — confirm SDK release workflow picks up the new version automatically (no changes expected).
- [ ] Cut release `sdk-node-v0.2.0` with `wingman-sdk-0.2.0.tgz` attached.

---

## 11. Open questions for @garethcheyne

1. **Endpoint name.** Plan uses `POST /api/chat/completions` (sibling of `/api/chat`). Alternative: `POST /api/completions`. Which?
2. **Stream chunk format.** Plan emits OpenAI-shaped SSE (`data: {"choices":[{"delta":{"content":"..."}}]}`). The existing `/api/chat` stream already does this — confirmed consistent. ✅
3. **`tool_choice: "required"`.** Some upstream models don't honour `"required"`. Pass through verbatim and let upstream surface the error, or reject at the proxy if `capabilities.supports.tool_choice_required !== true`? Plan currently says **pass through**.
4. **Per-key tool-calling opt-in.** Should API keys carry a `tools_allowed: boolean` flag so an admin can issue keys that explicitly can't use tool calling (e.g. cheaper rate)? **Not in v0.2** by default; flag for v0.3.
5. **Logging cardinality.** Should tool names emitted in `tool_calls` be recorded in `request_log` (new column) or kept in JSON elsewhere? Plan defers to v0.3.

---

## 12. Tracking

Once accepted, split this plan into GitHub issues:
- **#TBD** — `proxy: chatCompletionRaw + /api/chat/completions endpoint`
- **#TBD** — `proxy: model capability filtering on /api/models`
- **#TBD** — `proxy: tokenizer counts tools + role:tool messages`
- **#TBD** — `sdk(node): chat.completions resource + types`
- **#TBD** — `sdk(node): models.list filtering + listToolCapable helper`
- **#TBD** — `sdk(node): error class additions`
- **#TBD** — `release: @wingman/sdk v0.2.0`

Linked downstream consumer: **NextDocs** — once v0.2.0 ships, NextDocs migrates `@anthropic-ai/sdk` → `@wingman/sdk` in:
- `src/app/api/agent/claude-chat/route.ts` (Alice — uses tool calling extensively)
- `src/app/api/admin/kb/classify/route.ts`
- `src/app/api/admin/features/analyze/route.ts`
- `src/app/api/admin/features/analyze/regenerate-group/route.ts`
- `src/lib/alice/tools.ts` (tool schema translation: Anthropic `input_schema` → OpenAI `function.parameters`)
