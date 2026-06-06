# Wingman SDKs

Official client libraries for the Wingman API.

| Language | Path | Status |
|---|---|---|
| Node / TypeScript | [`sdk/node/`](node/) | v0.2 (dev only, not published) |
| Python | [`sdk/python/`](python/) | planned |
| .NET (C#) | [`sdk/dotnet/`](dotnet/) | planned |

All three implementations follow the same shape so usage stays predictable
across stacks:

```
client = new Wingman({ apiKey, baseURL? })
client.health.check()
client.models.list()
client.chat.create({ sessionKey, message, model?, systemPrompt?, stream? })
client.chat.stream({ sessionKey, message, model?, systemPrompt? })
```

## Design notes

Architecture borrowed (re-implemented, not copied) from the
[Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
(MIT).

Key shared decisions:

- **Auth**: `Authorization: Bearer wm_...` (proxy also accepts `x-api-key: wm_...`).
- **Errors**: typed hierarchy — `WingmanError → APIError → {BadRequest, Authentication, PermissionDenied, NotFound, RateLimit, InternalServer, APIConnection, APIUserAbort}`.
- **Streaming**: SSE; high-level `chat.stream()` helper emits incremental text deltas in addition to the raw async iterator.
- **Retries**: default 2, exponential backoff, respect `Retry-After`, retry on `408 / 409 / 429 / 5xx` and network errors.
- **Timeout**: 60s default per request (override per-call).
- **Base URL**: required; pass your Wingman proxy host explicitly (e.g. `https://wingman.example.com` or `http://localhost:3200`).
- **Multi-turn**: handled server-side via `sessionKey`; the SDK does not maintain conversation state.

## Endpoints covered (v0.2)

| Method | Path | SDK |
|---|---|---|
| `GET` | `/api/health` | `client.health.check()` |
| `GET` | `/api/models` | `client.models.list()` |
| `POST` | `/api/chat` | `client.chat.create(...)` + `.stream(...)` |
