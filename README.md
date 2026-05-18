<p align="center">
  <img src="assets/wingman-ai.png" alt="Wingman" width="200" />
</p>

<h1 align="center">Wingman</h1>

<p align="center">
  <strong>Built for Copilot &mdash; with Copilot.</strong>
</p>

<p align="center">
  <em>A self-hosted AI proxy &amp; chat UI powered by your GitHub Copilot subscription &mdash; coded almost entirely with the same models it ships.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Express-5-blue?logo=express" alt="Express 5" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
</p>

---

Wingman gives you a private, self-hosted chat interface that routes through GitHub Copilot's model catalog — the same models powering VS Code Copilot, accessible from a clean web UI. No additional API keys required, just your existing GitHub Copilot subscription.

## Features

- **Full model catalog** — GPT-4o, Claude Opus/Sonnet, Gemini, and every model GitHub Copilot supports
- **Streaming responses** — real-time token streaming with markdown rendering
- **Markdown rendering** — headings, code blocks with syntax highlighting & copy button, tables, lists, blockquotes
- **Image support** — paste, drag-drop, or upload images directly into chat
- **Session persistence** — conversations stored in PostgreSQL with sidebar navigation
- **GitHub Device OAuth** — authenticate with GitHub the same way VS Code does
- **Local auth** — password-protected admin accounts with bcrypt hashing
- **Guided setup** — first-run wizard walks through account creation and GitHub connection
- **Admin dashboard** — monitor usage, manage connections, view request logs
- **Docker-ready** — single `docker compose up` to run everything
- **Configurable ports** — all ports customizable via `.env`

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Web UI     │───▶│ Proxy API  │────▶│  GitHub Copilot │
│  (Next.js)   │     │  (Express)   │     │    Models API    │
│  Port 3000   │     │  Port 3200   │     └──────────────────┘
└──────────────┘     └──────┬───────┘
                            │
                    ┌───────┴───────┐
                    │               │
              ┌─────┴─────┐  ┌─────┴─────┐
              │ PostgreSQL│  │   Redis   │
              │  Port 5432│  │ Port 6379 │
              └───────────┘  └───────────┘
```

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- A [GitHub Copilot](https://github.com/features/copilot) subscription (Individual, Business, or Enterprise)

### 1. Clone & configure

```bash
git clone https://github.com/garethcheyne/copilot-wingman.git
cd copilot-wingman
cp .env.example .env
```

Generate secure keys:

```bash
# Generate INTERNAL_API_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the generated values into `.env`.

### 2. Start everything

```bash
docker compose up -d
```

### 3. Complete setup

Open [http://localhost:3000](http://localhost:3000) and follow the guided setup:

1. **Create account** — set your admin username and password
2. **Connect GitHub** — authenticate via GitHub Device OAuth flow
3. **Start chatting** — you're ready to go

## Upgrading

To upgrade an existing deployment, run the bundled script from the repo root:

```bash
./upgradeWingman.sh
```

It performs a safe, data-preserving upgrade:

1. **Force-syncs** the working tree to `origin/<current-branch>` (`git fetch` + `reset --hard` + `clean -fd`). Your `.env` and `.env.local` are explicitly preserved — production servers should never carry local edits.
2. **Backs up Postgres** to `./backups/wingman-YYYYmmdd-HHMMSS.sql.gz` via `pg_dump` running inside the live container. The upgrade aborts if the backup fails.
3. **Rebuilds only the app containers** (`web` + `proxy`). The `postgres` and `redis` containers — and their named volumes — are never recreated, never removed, never `down -v`'d.
4. **Applies `schema.sql` additively** through `proxy/scripts/apply-migration.mjs`. All statements use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, so they're safe to re-run on every upgrade.
5. **Health-checks** `/api/health` and prints the running version.

Flags:

| Flag | Purpose |
|---|---|
| `--no-pull` | Skip the git sync (use code that's already checked out) |
| `--no-backup` | Skip the database dump (not recommended) |
| `--skip-build` | Restart containers without rebuilding images |

## Reverse Proxy Setup

If you're running Wingman behind a reverse proxy (nginx, Caddy, etc.), update `NEXT_PUBLIC_PROXY_URL` in `.env` to the public URL your browser will use to reach the proxy API:

```bash
# Example: nginx forwards /api/* to the proxy container
NEXT_PUBLIC_PROXY_URL=https://wingman.yourdomain.com

# Example: proxy on a subdomain
NEXT_PUBLIC_PROXY_URL=https://api.yourdomain.com
```

> **Important:** `NEXT_PUBLIC_PROXY_URL` is baked into the client-side JavaScript at build time. After changing it, rebuild the web container:
> ```bash
> docker compose up --build wingman-web -d
> ```

Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name wingman.yourdomain.com;

    # Web UI
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy API
    location /api/ {
        proxy_pass http://localhost:3200/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
        proxy_buffering off;       # required for streaming responses
    }
}
```

## Local Development

### Proxy (Express API)

```bash
cd proxy
npm install
npm run dev          # starts on port 3200 with hot-reload
```

### Web (Next.js UI)

```bash
cd web
npm install
npm run dev          # starts on port 3000
```

> Both require PostgreSQL and Redis running. Start them with:
> ```bash
> docker compose up postgres redis -d
> ```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `WEB_PORT` | Web UI port | `3000` |
| `PROXY_PORT` | Proxy API port | `3200` |
| `POSTGRES_PORT` | PostgreSQL host port | `5440` |
| `REDIS_PORT` | Redis host port | `6379` |
| `NEXT_PUBLIC_PROXY_URL` | Public URL the browser uses to reach the proxy API | `http://localhost:3200` |
| `INTERNAL_API_KEY` | Shared secret between web and proxy | — |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting GitHub tokens at rest | — |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://wingman:password@localhost:5440/wingman` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |

## CLI Tools

```bash
# Reset all user accounts (re-triggers setup wizard)
node proxy/scripts/reset-users.mjs
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Express 5, TypeScript |
| **Database** | PostgreSQL 16 |
| **Cache** | Redis 7 |
| **Auth** | bcrypt, GitHub Device OAuth |
| **Markdown** | react-markdown, remark-gfm, rehype-highlight |
| **Container** | Docker Compose |

## Project Structure

```
copilot-wingman/
├── proxy/                 # Express API server
│   ├── src/
│   │   ├── routes/        # API endpoints (chat, auth, admin, health)
│   │   ├── services/      # Business logic (copilot client, OAuth, sessions)
│   │   ├── middleware/     # Auth & rate limiting
│   │   └── db/            # PostgreSQL client & schema
│   └── scripts/           # CLI utilities
├── web/                   # Next.js frontend
│   ├── app/               # App router pages
│   │   ├── (app)/         # Authenticated routes (chat, admin)
│   │   └── setup/         # First-run setup wizard
│   └── components/        # React components (chat, sidebar, markdown)
├── docker-compose.yml
├── .env.example
└── assets/
    └── wingman-ai.png
```

## What Wingman is not

Wingman is a **transport-layer traffic controller** for GitHub Copilot's model
catalog. It routes, authenticates, rate-limits, and logs. It does not — and
cannot — modify how the underlying models *decode*.

### Parallel tool calls

When tool calling lands (planned for SDK v0.2 — see
[PLAN-TOOL-CALLING.md](./PLAN-TOOL-CALLING.md)), Wingman passes the upstream
`capabilities.supports.parallel_tool_calls` flag through to clients. Whether a
model emits *one* tool call per assistant turn or *several* in parallel is a
model-side behaviour decided inside the decoder.

At the time of writing:

| Model (via Copilot)   | Parallel tool calls   | Effect for tool-using agents |
| --------------------- | --------------------- | ---------------------------- |
| `gpt-4o`              | ✅                     | Multiple tool calls per turn |
| `claude-sonnet-4.x`   | ✅ (via normalisation) | Multiple tool calls per turn |
| `gemini-2.x`          | ✅                     | Multiple tool calls per turn |

**Note on Claude:** GitHub Copilot's `/chat/completions` endpoint leaks
Anthropic's native multi-content-block shape upstream — instead of returning the
OpenAI-standard `choices[0].message.tool_calls: [a, b, c]`, it returns several
sibling `choices[]` (one prose, three tool calls) with no `index`. An
OpenAI-compatible client would inspect `choices[0]` only and conclude "no tool
calls", even though `finish_reason` was `tool_calls`. Wingman now collapses
this in `normalizeChatCompletion()` (`proxy/src/services/copilot-client.ts`):
indexless multi-choice responses become a single OpenAI-shape choice with all
`tool_calls[]` merged and any prose / reasoning concatenated. Standard
responses (`n > 1` requests with distinct indices) pass through untouched.

Confirmed end-to-end: `claude-sonnet-4.6` returned three `get_weather` calls in
a single assistant turn; we executed them locally, fed the results back, and
Claude composed a final answer using all three.

**What Wingman still won't do:** *fabricate* parallel tool calls when the
upstream model genuinely emits one at a time. Normalising Copilot's malformed
multi-choice envelope is shape-preserving; inventing tool-call IDs the model
never authorised would be a correctness hazard. Different thing entirely.

### GitHub Copilot quota

Every Wingman call consumes against the *GitHub user's* quota whose OAuth token
backs the active `gh_connection`. Premium models (Claude, GPT-4o, o1, etc.) burn
your monthly **premium-request** allowance; the base model (currently GPT-4.1)
is unlimited on Business / Enterprise plans.

If you run Wingman against your personal Copilot account, expect heavy Wingman
traffic to compete with your day-to-day VS Code Copilot usage. Mitigations:

- **Use a service-account GitHub user** for Wingman's OAuth connection — its
  own seat, its own quota pool.
- **Route non-premium workloads** (classification, summarisation) to the base
  model — quality dip is small, premium quota is preserved.
- **Multi-connection rotation** — add several `gh_connections` rows; Wingman
  can round-robin (roadmap item, not in v0.2).

## Acknowledgements

A heartfelt thank-you to **[Anthropic](https://www.anthropic.com)** — parts of
Wingman's API client, streaming helpers, and SSE plumbing were modeled on (and
in places adapted directly from) the open-source
[Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript).
That SDK saved this project weeks of work. Open source like this is what makes
side projects like Wingman possible.

We're also indebted to **[GitHub Copilot](https://github.com/features/copilot)**
— not just as the model backend Wingman proxies, but as the pair-programmer
that wrote most of this codebase. *Built for Copilot. Built with Copilot.*

## Contributors

<table>
  <tr>
    <td align="center" valign="top" width="220">
      <a href="https://github.com/garethcheyne">
        <img src="https://github.com/garethcheyne.png" width="88" height="88" alt="@garethcheyne" />
        <br />
        <strong>Gareth Cheyne</strong>
      </a>
      <br />
      <sub>Creator &middot; Maintainer</sub>
    </td>
    <td align="center" valign="top" width="220">
      <a href="https://github.com/features/copilot">
        <img src="https://raw.githubusercontent.com/github/explore/main/topics/github-copilot/github-copilot.png" width="88" height="88" alt="GitHub Copilot" />
        <br />
        <strong>GitHub Copilot</strong>
      </a>
      <br />
      <sub>Pair programmer &middot; Co-author of nearly every commit</sub>
    </td>
  </tr>
</table>

> Copilot's commits are attributed via the `Co-authored-by: GitHub Copilot`
> trailer on every commit it helped write.

## License

MIT

---

<p align="center">
  <em>No LLMs were harmed in the making of this project &mdash; just immense token abuse.</em>
</p>
