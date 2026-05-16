<p align="center">
  <img src="assets/wingman-ai.png" alt="Wingman" width="200" />
</p>

<h1 align="center">Wingman</h1>

<p align="center">
  <strong>Self-hosted AI proxy &amp; chat UI powered by your GitHub Copilot subscription</strong>
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

## License

MIT
