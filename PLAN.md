# Wingman — Project Plan

## Overview

A self-hosted proxy that exposes GitHub Copilot through your own REST API. Uses the GitHub CLI (`gh`) for authentication, calls the underlying Copilot Chat API directly (OpenAI-compatible format), and wraps it in a Next.js frontend with session-based conversation storage.

## Architecture

```
Browser / Mobile App
    ↓ HTTPS
Next.js (Auth.js + API Routes + Chat UI + shadcn/ui)
    ↓ internal network only
Copilot Proxy (Node.js/Express in Docker)
    ├── Token Manager    →  GitHub PAT (encrypted in DB) → Copilot JWT (cached, auto-refresh)
    ├── Session Manager  →  PostgreSQL read/write
    ├── Context Builder  →  trims history to token budget
    ├── Health Monitor   →  validates token + Copilot access every 5 min
    └── Copilot Client   →  POST api.githubcopilot.com/chat/completions
    ↓
GitHub Copilot Service
```

## How It Works

`gh copilot` CLI commands are interactive TUI tools — not suitable for programmatic use. Instead, we use the underlying API:

1. `gh auth token` → returns your GitHub PAT
2. POST `https://api.github.com/copilot_internal/v2/token` with PAT → returns a short-lived Copilot JWT (~30 min)
3. POST `https://api.githubcopilot.com/chat/completions` with Copilot JWT → OpenAI-compatible chat response (supports streaming)

This gives us a proper streaming JSON API — no TUI scraping.

## GitHub Auth Management

### The Problem

The entire system depends on a valid GitHub token with Copilot access. This token can expire, be revoked, or become invalid at any time. We can't just mount `~/.config/gh` and forget about it — we need active management, health checks, and notifications.

### Auth Flow Options

**Option A — GitHub PAT (recommended for v1)**
1. Admin generates a Fine-Grained PAT on github.com with `copilot` scope
2. Admin pastes it into the Admin UI → stored encrypted in PostgreSQL
3. Proxy reads the encrypted token from DB on startup and caches in memory
4. No `gh` CLI needed at runtime — we call the API directly with the PAT

**Option B — GitHub OAuth Device Flow (better for long-term)**
1. Admin clicks "Connect GitHub" in Admin UI
2. Proxy starts a device flow: `POST https://github.com/login/device/code`
3. Admin gets a user code + URL, opens github.com, enters the code
4. Proxy polls `POST https://github.com/login/oauth/access_token` until approved
5. OAuth token stored encrypted in DB
6. OAuth tokens are long-lived but can be revoked by the user on github.com

### Token Storage

```sql
CREATE TABLE gh_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(100) NOT NULL,                    -- e.g. "Gareth's Copilot"
    auth_method VARCHAR(20) NOT NULL                -- 'pat' or 'oauth'
        CHECK (auth_method IN ('pat', 'oauth')),
    encrypted_token BYTEA NOT NULL,                 -- AES-256-GCM encrypted
    token_expires_at TIMESTAMPTZ,                   -- NULL if no expiry
    github_username VARCHAR(100),                    -- populated after validation
    copilot_plan VARCHAR(50),                        -- 'individual', 'business', 'enterprise'
    status VARCHAR(20) NOT NULL DEFAULT 'active'     -- 'active', 'expired', 'revoked', 'error'
        CHECK (status IN ('active', 'expired', 'revoked', 'error')),
    last_validated_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Token encryption key: derived from `ENCRYPTION_KEY` env var using HKDF. Never stored in the DB.

### Health Check & Notification System

The proxy runs a background health loop:

```
Every 5 minutes:
  1. Decrypt the stored GitHub token
  2. GET https://api.github.com/user (validates token is alive)
  3. GET https://api.github.com/copilot_internal/v2/token (validates Copilot access)
  4. If token has expiry → check if <7 days remaining
  5. Update gh_connections.status + last_validated_at

On failure:
  - Update status to 'expired' or 'revoked' or 'error'
  - Set last_error with details
  - Fire notification
```

### Notification Channels

```sql
CREATE TABLE notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'webhook', 'slack')),
    config JSONB NOT NULL,           -- { "url": "..." } or { "email": "..." }
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES notification_channels(id),
    event VARCHAR(50) NOT NULL,      -- 'token_expired', 'token_expiring_soon', 'token_revoked', 'copilot_access_lost'
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Notification events:
- **`token_expiring_soon`** — PAT expires within 7 days
- **`token_expired`** — PAT has expired, all requests will fail
- **`token_revoked`** — Token returns 401 on validation
- **`copilot_access_lost`** — GitHub token works but Copilot token exchange fails (subscription lapsed?)
- **`token_refreshed`** — Admin connected a new token (confirmation)

### Admin UI — Connection Management

The Admin dashboard is **local-only** — no OAuth or external auth required. Access is restricted by:
1. Network-level: only accessible on `localhost` / internal Docker network
2. A simple `ADMIN_API_KEY` env var checked via middleware (for any non-localhost access)

The Admin dashboard gets a "GitHub Connection" panel:

```
┌─────────────────────────────────────────────────┐
│ GitHub Connection                                │
│                                                  │
│ Status:    ● Connected                           │
│ Account:   gareth-cheyne                         │
│ Plan:      Copilot Business                      │
│ Method:    Personal Access Token                 │
│ Expires:   2026-08-15 (92 days)                  │
│ Last check: 2 minutes ago ✓                      │
│                                                  │
│ [Reconnect]  [Test Connection]  [Disconnect]     │
│                                                  │
│ Notifications                                    │
│ ☑ Email: gareth.cheyne@... on token expiry       │
│ ☑ Webhook: https://hooks.slack.com/... on error  │
│ [+ Add notification channel]                     │
└─────────────────────────────────────────────────┘
```

### Proxy Token Resolution (Runtime)

At request time, the proxy resolves the token in this order:

1. **In-memory cache** — cached decrypted token + Copilot JWT (fastest)
2. **Database** — re-read + decrypt from `gh_connections` (if cache expired)
3. **Fail** — return 503 with `{ error: "No valid GitHub connection configured" }`

The Copilot JWT (from step 2 of "How It Works") is cached separately with its own TTL (~25 min, refreshed 5 min before the ~30 min expiry).

## Assets & Branding

Reference images in `assets/`:
- `image.png` — 3D Copilot mascot (neon purple/blue/cyan glow, black bg)
- `github-copilot.jpg` — Flat Copilot icon (white mascot on dark rounded square)
- `images.jpg` — Brand card grid (blue → purple → lavender gradient tiles)

### Logo Strategy

Use the **flat icon** (from `github-copilot.jpg`) as the primary app identity. The 3D render is too detailed for small sizes.

### Required Assets (generated during Phase 5)

```
web/public/
├── favicon.ico                  # 16x16 + 32x32 multi-size .ico
├── favicon-16x16.png
├── favicon-32x32.png
├── apple-touch-icon.png         # 180x180
├── android-chrome-192x192.png
├── android-chrome-512x512.png
├── og-image.png                 # 1200x630 — gradient bg + mascot + title
├── copilot-avatar.png           # 40x40 — bot avatar in chat messages
├── copilot-avatar@2x.png        # 80x80 — retina bot avatar
└── site.webmanifest
```

### Asset Pipeline

1. Start with `github-copilot.jpg` — remove background → transparent PNG at 512x512
2. Use `sharp` or `@vercel/og` to generate all favicon sizes
3. OG image: gradient background (`#3B82F6` → `#8B5CF6` → `#C4B5FD` diagonal) + centered mascot + "Copilot API" text
4. Chat avatar: 40px circle crop of flat icon, purple ring border

### Gradient Specification (from `images.jpg`)

```css
/* Login/splash page + OG image background */
.copilot-gradient {
  background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #C4B5FD 100%);
}

/* Subtle card hover / active state */
.copilot-gradient-subtle {
  background: linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--copilot-purple) / 0.1) 100%);
}
```

## Project Structure

```
copilot-api/
├── PLAN.md
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── proxy/                          # Copilot proxy API (Node.js/Express)
│   ├── src/
│   │   ├── server.ts               # Express entry point
│   │   ├── routes/
│   │   │   └── chat.ts             # POST /api/chat
│   │   ├── services/
│   │   │   ├── copilot-token.ts    # Token acquisition + caching + refresh
│   │   │   ├── copilot-client.ts   # Chat completions client (streaming)
│   │   │   ├── session-manager.ts  # DB session/message CRUD
│   │   │   └── context-builder.ts  # History trimming to token budget
│   │   ├── db/
│   │   │   ├── schema.sql          # PostgreSQL schema
│   │   │   └── client.ts           # pg connection pool
│   │   └── middleware/
│   │       ├── auth.ts             # Internal API key validation
│   │       └── rate-limit.ts       # Redis-backed rate limiting
│   ├── package.json
│   └── tsconfig.json
├── web/                            # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx              # Root layout + ThemeProvider
│   │   ├── api/
│   │   │   ├── chat/
│   │   │   │   └── route.ts        # Proxies to internal proxy API
│   │   │   └── admin/
│   │   │       ├── connection/
│   │   │       │   └── route.ts    # GitHub connection CRUD
│   │   │       └── notifications/
│   │   │           └── route.ts    # Notification channel CRUD
│   │   ├── (app)/
│   │   │   ├── chat/
│   │   │   │   └── page.tsx        # Chat UI
│   │   │   └── layout.tsx          # App shell with sidebar
│   │   └── (admin)/
│   │       ├── admin/
│   │       │   └── page.tsx        # Dashboard overview
│   │       ├── admin/connection/
│   │       │   └── page.tsx        # GitHub connection management
│   │       ├── admin/sessions/
│   │       │   └── page.tsx        # Session browser
│   │       ├── admin/usage/
│   │       │   └── page.tsx        # Usage analytics
│   │       └── layout.tsx          # Admin shell (local-only, no OAuth)
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components (auto-generated)
│   │   ├── chat/
│   │   │   ├── chat-input.tsx      # Message input with submit
│   │   │   ├── chat-message.tsx    # Single message bubble + markdown
│   │   │   ├── chat-list.tsx       # Scrollable message list
│   │   │   └── session-sidebar.tsx # Session list + create/switch
│   │   └── admin/
│   │       ├── connection-card.tsx  # GitHub connection status card
│   │       ├── usage-chart.tsx     # Usage analytics chart
│   │       └── session-table.tsx   # Session browser table
│   ├── lib/
│   │   ├── auth.ts                 # Auth.js config
│   │   ├── api-client.ts           # Internal proxy HTTP client
│   │   └── utils.ts                # shadcn cn() utility
│   ├── components.json             # shadcn/ui config
│   ├── tailwind.config.ts
│   ├── package.json
│   └── next.config.ts
├── .env.example
└── README.md
```

## Database Schema

```sql
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key VARCHAR(200) NOT NULL UNIQUE,   -- format: "tenant:user:project"
    system_prompt TEXT,                          -- optional per-session system prompt
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    token_count INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session_time ON chat_messages(session_id, created_at);
CREATE INDEX idx_sessions_key ON chat_sessions(session_key);
```

## Session & Context Strategy

### Session Keys (Multi-Tenant)

Format: `tenant:user:project`

Examples:
- `contoso:gareth:bc-sync`
- `default:gareth:general`

### Context Window Management

Token budget: ~8,000 tokens for history (reserve room for system prompt + new message + response).

Strategy:
1. Always include the system prompt
2. Load all messages for the session from DB
3. Walk backwards from newest, summing token counts
4. Include as many recent messages as fit in the budget
5. If history exceeds budget, the oldest included batch gets summarized into a single condensed message

## Phases

### Phase 1 — Copilot Proxy Core

Build a standalone Express API that can exchange a message with Copilot.

| # | Task | Detail |
|---|------|--------|
| 1.1 | Project scaffold | `proxy/` — TypeScript, Express, eslint, tsconfig |
| 1.2 | Token manager | `child_process.execSync('gh auth token')` → POST `/copilot_internal/v2/token` → cache JWT in memory, refresh 5 min before expiry, handle concurrent refresh races with a mutex |
| 1.3 | Copilot client | POST to `api.githubcopilot.com/chat/completions` with `{ messages, model, stream }`, support SSE streaming, return parsed response |
| 1.4 | Chat route | `POST /api/chat` accepts `{ sessionId, message }`, calls copilot client, returns response (streaming or JSON) |
| 1.5 | Health endpoint | `GET /health` — checks gh auth status + token freshness |
| 1.6 | Manual test | curl against the running proxy on port 3200, confirm round-trip works |

### Phase 2 — Docker Container

Package the proxy into a slim, reproducible image.

| # | Task | Detail |
|---|------|--------|
| 2.1 | Dockerfile | `node:22-alpine` base, install `gh` CLI + `gh-copilot` extension, copy built proxy, expose port 3200 |
| 2.2 | docker-compose.yml | Services: proxy, postgres (16-alpine), redis (7-alpine). Named volumes for pg data + redis data. Mount `~/.config/gh` as read-only secret volume |
| 2.3 | .env.example | Document all required env vars |
| 2.4 | Smoke test | `docker compose up`, hit `/health`, confirm auth works inside container |

### Phase 3 — PostgreSQL Session Storage

Add persistent conversation history.

| # | Task | Detail |
|---|------|--------|
| 3.1 | Schema | Run `schema.sql` — sessions + messages tables |
| 3.2 | DB client | `pg` connection pool with retry logic |
| 3.3 | Session manager | `getOrCreateSession(key)`, `addMessage(sessionId, role, content, tokenCount)`, `getMessages(sessionId)` |
| 3.4 | Context builder | Load history → count tokens → trim to budget → return messages array for Copilot API |
| 3.5 | Wire into chat route | Chat route now loads context, sends to Copilot, stores response |
| 3.6 | Test | Multi-turn conversation, verify context is maintained |

### Phase 4 — Next.js Auth + API Gateway

Public-facing authenticated layer for chat users. Admin UI is local-only (no OAuth).

| # | Task | Detail |
|---|------|--------|
| 4.1 | Next.js scaffold | `create-next-app` with App Router, TypeScript |
| 4.2 | Auth.js setup | GitHub OAuth provider — for **chat users only**, not admin |
| 4.3 | API route | `app/api/chat/route.ts` — validate session, extract user, proxy to internal proxy API |
| 4.4 | Internal API key | Proxy validates a shared secret on all requests from Next.js |
| 4.5 | Admin middleware | Admin routes check `localhost` origin or `ADMIN_API_KEY` header — no OAuth |
| 4.6 | Rate limiting | Redis-backed sliding window — 30 req/min per user |
| 4.7 | Usage logging | Log every request: user, session, token count, latency |

### Phase 5 — Chat UI

Functional chat interface.

| # | Task | Detail |
|---|------|--------|
| 5.1 | Chat page | Streaming responses via `EventSource` / `ReadableStream` |
| 5.2 | Session sidebar | List sessions, create new, switch between |
| 5.3 | Markdown rendering | Code blocks with syntax highlighting, copy button |
| 5.4 | System prompt editor | Per-session system prompt configuration |

### Phase 6 — Admin & Monitoring

Visibility and management.

| # | Task | Detail |
|---|------|--------|
| 6.1 | Usage dashboard | Requests/day, tokens/day, per-user breakdown |
| 6.2 | Session browser | View any conversation history |
| 6.3 | Health monitor | Proxy status, token freshness, DB connectivity |
| 6.4 | Alerting | Notify on token refresh failures or error rate spikes |

## Technology Stack

### Frontend (web/)

| Component | Choice | Version | Reason |
|-----------|--------|---------|--------|
| Framework | Next.js (App Router) | 16 | Auth integration, API routes, RSC, layouts |
| UI library | shadcn/ui | latest | Composable, accessible, copy-paste components — not a dependency |
| Styling | Tailwind CSS | 4 | Utility-first, pairs with shadcn |
| Theme | next-themes | latest | Dark/light mode toggle |
| Icons | Lucide React | latest | Default icon set for shadcn |
| Markdown | react-markdown + rehype-highlight | latest | Render Copilot responses with syntax-highlighted code blocks |
| Auth | Auth.js (GitHub provider) | 5 | Chat users only — admin UI is local-only, no OAuth |
| Charts | Recharts (via shadcn chart) | latest | Usage analytics in admin dashboard |
| Tables | @tanstack/react-table (via shadcn) | latest | Session browser, usage tables |
| Forms | react-hook-form + zod (via shadcn) | latest | Connection setup, notification config |
| Toasts | sonner (via shadcn) | latest | Connection status, error notifications |

### shadcn/ui Components (installed on demand)

| Component | Used In |
|-----------|---------|
| `button` | Everywhere |
| `card` | Connection card, session cards, dashboard stats |
| `input` / `textarea` | Chat input, connection form, system prompt editor |
| `dialog` | New session, add notification channel |
| `dropdown-menu` | Session actions, user menu |
| `avatar` | Chat messages, user identity |
| `badge` | Connection status (active/expired/error) |
| `table` | Session browser, usage logs |
| `chart` | Usage dashboard |
| `tabs` | Admin sections |
| `sidebar` | App shell navigation |
| `scroll-area` | Chat message list |
| `separator` | Layout divisions |
| `skeleton` | Loading states |
| `switch` | Enable/disable notifications |
| `toast` / `sonner` | Status notifications |
| `form` / `label` | All forms |
| `select` | Notification type picker |
| `alert` | Token expiry warnings |
| `tooltip` | Action button hints |
| `sheet` | Mobile sidebar |

### Theme — GitHub Copilot Dark

Based on the brand image in `assets/image.png`. Dark-first with electric blue, cyan, neon green, and purple accents.

#### Color Palette (HSL for shadcn CSS variables)

```css
/* Dark mode (default) */
--background: 220 13% 7%;          /* #0D1117 — GitHub dark bg */
--foreground: 210 17% 90%;         /* #E6EDF3 — light gray text */

--card: 220 13% 9%;                /* #161B22 — slightly elevated surface */
--card-foreground: 210 17% 90%;

--popover: 220 13% 9%;
--popover-foreground: 210 17% 90%;

--primary: 225 73% 57%;            /* #3B82F6 — electric blue */
--primary-foreground: 0 0% 100%;

--secondary: 220 13% 14%;          /* #21262D — muted surface */
--secondary-foreground: 210 17% 82%;

--muted: 220 13% 14%;
--muted-foreground: 215 14% 55%;   /* #8B949E — subdued text */

--accent: 187 86% 43%;             /* #0DB7D4 — cyan accent */
--accent-foreground: 0 0% 100%;

--destructive: 0 72% 51%;          /* #EF4444 — red for errors */
--destructive-foreground: 0 0% 100%;

--border: 220 13% 18%;             /* #30363D — subtle borders */
--input: 220 13% 18%;
--ring: 225 73% 57%;               /* matches primary */

--radius: 0.5rem;

/* Semantic extras (custom, not standard shadcn) */
--copilot-green: 142 71% 45%;      /* #22C55E — neon green (status: connected) */
--copilot-purple: 258 90% 66%;     /* #8B5CF6 — purple (Copilot bot avatar) */
--copilot-blue-glow: 225 73% 57% / 0.15; /* blue glow for focused elements */
```

```css
/* Light mode */
--background: 0 0% 100%;
--foreground: 222 47% 11%;

--card: 0 0% 98%;
--card-foreground: 222 47% 11%;

--primary: 225 73% 50%;            /* slightly deeper blue for light bg */
--primary-foreground: 0 0% 100%;

--secondary: 220 14% 96%;
--secondary-foreground: 222 47% 11%;

--muted: 220 14% 96%;
--muted-foreground: 215 16% 47%;

--accent: 187 86% 38%;
--accent-foreground: 0 0% 100%;

--border: 220 13% 91%;
--input: 220 13% 91%;
--ring: 225 73% 50%;

--copilot-green: 142 71% 35%;
--copilot-purple: 258 90% 55%;
```

#### Usage Mapping

| Variable | Where |
|----------|-------|
| `--primary` (electric blue) | Buttons, links, active sidebar items, send button, focus rings |
| `--accent` (cyan) | Copilot response highlights, streaming cursor, inline code bg |
| `--copilot-green` | Connection status "active" badge, health check pass |
| `--copilot-purple` | Copilot avatar/icon, bot message accent border |
| `--destructive` | "Expired" / "Error" badges, disconnect button |
| `--muted` | Timestamps, secondary text, disabled states |
| `--card` | Chat message bubbles, session cards, dashboard stat cards |
| `--border` | Sidebar dividers, input borders, card outlines |

#### Chat Message Styling

```
User message:   bg-primary/10, border-l-2 border-primary
Copilot message: bg-card, border-l-2 border-copilot-purple
Code blocks:    bg-secondary, font-mono, rounded-md
```

### Backend — Proxy (proxy/)

| Component | Choice | Version | Reason |
|-----------|--------|---------|--------|
| Runtime | Node.js | 22 LTS | Same ecosystem as Next.js, native streaming |
| Framework | Express | 5 | Lightweight, SSE support, well-known |
| Language | TypeScript | 5.x | Type safety across the stack |
| Token counting | tiktoken (js port) | latest | Accurate OpenAI-compatible token counting |

### Infrastructure

| Component | Choice | Version | Reason |
|-----------|--------|---------|--------|
| Database | PostgreSQL | 16-alpine | Reliable, UUID support, structured session data |
| Cache / Rate limit | Redis | 7-alpine | Fast counters, optional response caching |
| Container | Docker + Alpine | latest | Minimal image size |
| Streaming | SSE (Server-Sent Events) | — | Native browser support, simpler than WebSockets for chat |

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Copilot internal API is undocumented and may change | Breaking changes to token exchange or chat endpoint | Pin gh-copilot extension version, add integration tests that run on schedule, abstract the client behind an interface |
| ToS compliance — programmatic access may not be permitted | Service suspension | Use Copilot Business/Enterprise tier, review ToS, keep usage within reasonable bounds |
| Token refresh race conditions | 401 errors under load | Mutex/lock on refresh, single in-flight refresh at a time, queue waiting callers |
| gh auth persistence in Docker | Security exposure | Mount `~/.config/gh` read-only, treat as a secret, never log tokens |
| Copilot JWT short expiry (~30 min) | Stale tokens under low traffic | Background refresh timer, or refresh-on-401-retry pattern |
| Context window overflow | Truncated or incoherent responses | Token counting + sliding window + summarization fallback |

## Environment Variables

```env
# Proxy
PROXY_PORT=3200
INTERNAL_API_KEY=<shared-secret-between-nextjs-and-proxy>
ENCRYPTION_KEY=<32-byte-hex-key-for-token-encryption>
ADMIN_API_KEY=<optional-key-for-non-localhost-admin-access>
DATABASE_URL=postgresql://copilot:password@postgres:5432/copilot_api
REDIS_URL=redis://redis:6379

# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-secret>
GITHUB_CLIENT_ID=<oauth-app-client-id>
GITHUB_CLIENT_SECRET=<oauth-app-client-secret>
COPILOT_PROXY_URL=http://proxy:3200
```

## Current Status

- [x] Phase 0 — Planning (this document)
- [ ] Phase 1 — Copilot Proxy Core
- [ ] Phase 2 — Docker Container
- [ ] Phase 3 — PostgreSQL Session Storage
- [ ] Phase 4 — Next.js Auth + API Gateway
- [ ] Phase 5 — Chat UI
- [ ] Phase 6 — Admin & Monitoring
