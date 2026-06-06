---
description: "Send chat messages, list models, and check health of a Wingman proxy instance. Use when the user wants to interact with Wingman, send prompts to Copilot models, manage chat sessions, or query available LLMs via the Wingman API."
---

# Wingman API Skill

## What is Wingman?

Wingman is a self-hosted proxy for GitHub Copilot's model API. It provides:
- Multi-model chat (GPT-4o, Claude, Gemini, etc.) with persistent sessions
- API key management with per-key rate limits and model scoping
- Vision support (images and PDF pages rendered as images)
- Streaming (SSE) and one-shot responses

## Base URL

The Wingman proxy runs at the URL configured in the environment:
- Local dev: `http://localhost:3200`
- Production: configured per-deployment (check `NEXT_PUBLIC_PROXY_URL` or `PROD_URL` in `.env`)

## Authentication

Every request (except `/health`) requires a Wingman API key (prefix `wm_`).

Provide the key in **one** of these headers:
```
Authorization: Bearer wm_<48-hex-chars>
X-Api-Key: wm_<48-hex-chars>
```

## Endpoints

### POST /api/chat — Send a chat message

Sends a user message and returns an AI response. Sessions are persistent server-side.

**Request body (JSON):**
```json
{
  "sessionKey": "unique-conversation-id",
  "message": "Your prompt here",
  "model": "gpt-4o",
  "systemPrompt": "Optional, only applied on first message in session",
  "stream": false,
  "images": ["data:image/png;base64,..."]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `sessionKey` | Yes | Stable ID for the conversation thread. Reuse to continue, change to start fresh. |
| `message` | Yes | The user's message content. |
| `model` | No | Model ID from `/api/models`. Falls back to key's default or `gpt-4o-mini`. |
| `systemPrompt` | No | Set on session creation only; ignored on subsequent messages. |
| `stream` | No | `true` for SSE streaming (OpenAI-compatible delta format), `false` for JSON. |
| `images` | No | Array of base64 data URLs. Supports `image/*` (PNG/JPEG) and `application/pdf`. PDFs are rendered server-side to per-page PNGs (max 5 pages). Max 8 total images. Vision-capable models only. |

**One-shot response (stream: false):**
```json
{
  "sessionId": "uuid",
  "message": "The AI's response text"
}
```

**Streaming response (stream: true):**
Returns `Content-Type: text/event-stream` with OpenAI-compatible chunks:
```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" world"}}]}

data: [DONE]
```

### GET /api/models — List available models

Returns all models the calling API key can access.

**Response:**
```json
{
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "vendor": "OpenAI",
      "version": "2024-05-13",
      "chat_enabled": true,
      "capabilities": {
        "context_window": 128000,
        "max_output_tokens": 16384,
        "supports": { "vision": true, "function_calling": true }
      }
    }
  ],
  "default_model": "gpt-4o",
  "total": 25,
  "chat_capable": 22
}
```

### GET /health — Health check (no auth)

```json
{
  "status": "healthy",
  "checks": {
    "database": "connected",
    "github": { "status": "connected", "username": "user" }
  },
  "timestamp": "2026-06-04T10:00:00.000Z"
}
```

Returns 200 when healthy, 503 when unhealthy.

## Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Missing `sessionKey` or `message` |
| 401 | Invalid or missing API key |
| 403 | Key valid but not authorized for requested model (response includes `allowed_models`) |
| 429 | Rate limit exceeded (check `X-RateLimit-Reset` header) |
| 500 | Upstream or internal error |

Error body shape:
```json
{ "error": "Human-readable message", "allowed_models": ["gpt-4o"] }
```

## Rate Limiting

- Per-key limit (default 30 req/min, configurable per key)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Multi-Turn Conversations

The proxy manages conversation history server-side. To have a multi-turn conversation:
1. Pick a stable `sessionKey` (e.g. `"user-42:project-alpha"`)
2. Send all messages with the same `sessionKey`
3. The proxy automatically includes prior context in each request to the LLM

To start a fresh conversation, use a new `sessionKey`.

## Vision / PDF Support

- Attach images as base64 data URLs in the `images` array
- **PDFs are supported directly** — send `data:application/pdf;base64,...` and the proxy renders each page to a PNG server-side (max 5 pages per PDF, 1.5x scale)
- The web UI also supports client-side PDF rendering via drag-drop/paste
- Mix images and PDFs in the same request
- Max 8 total images per message (after PDF expansion)
- Use a vision-capable model (e.g. `gpt-4o`, `claude-sonnet-4`)

### Example: Sending a PDF via API

```bash
# Base64-encode a PDF file and send it
PDF_B64=$(base64 -w 0 document.pdf)
curl -X POST https://wingman.example.com/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wm_your_key_here" \
  -d "$(jq -n --arg pdf "data:application/pdf;base64,$PDF_B64" '{
    sessionKey: "doc-review",
    message: "Summarise this document.",
    model: "gpt-4o",
    images: [$pdf]
  }')"
```

## Example: curl

```bash
curl -X POST https://wingman.example.com/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wm_your_key_here" \
  -d '{
    "sessionKey": "demo-session",
    "message": "What is the capital of New Zealand?",
    "model": "gpt-4o"
  }'
```

## Example: Node.js SDK

```typescript
import { Wingman } from '@wingman/sdk';

const client = new Wingman({
  apiKey: 'wm_...',
  baseURL: 'https://wingman.example.com',
});

// One-shot
const response = await client.chat.create({
  sessionKey: 'my-session',
  message: 'Explain async/await',
  model: 'gpt-4o',
});

// Streaming
const stream = await client.chat.stream({
  sessionKey: 'my-session',
  message: 'Write a poem',
});
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

## OpenAPI Spec

The full machine-readable spec is served at `GET /openapi.json` from any running Wingman proxy instance.
