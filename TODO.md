# Wingman — TODO

> Gap analysis & roadmap. Updated 2026-05-16.

---

## 🔴 Critical

- [x] **Secure admin routes** — All `/api/admin/*` endpoints protected by `sessionAuthMiddleware`
- [x] **Add test suite** — 76 API integration tests across 9 phases; unit test expansion still needed
- [x] **CI/CD pipeline** — GitHub Actions for lint/build/test on PR + Docker image publish on merge + release workflow
- [ ] **Database migrations** — Replace single `schema.sql` init with versioned migrations (e.g. node-pg-migrate)
- [x] **Fix dual-repo in VS Code** — Resolved with `git.autoRepositoryDetection: openEditors` workspace setting

## 🟠 High

- [ ] **Use Redis** — `ioredis` installed, container running, but nothing uses it; move rate limiting + session cache to Redis
- [x] **Remove `next-auth`** — Uninstalled; custom auth (AuthProvider + sessionAuthMiddleware) remains
- [ ] **Rate limiting persistence** — Current in-memory counter resets on restart; move to Redis for persistence + distributed support
- [x] **Error boundaries** — error.tsx for (app) and (admin) route groups + global-error.tsx
- [x] **Admin route middleware** — `sessionAuthMiddleware` applied consistently across all admin API endpoints
- [ ] **Expand test suite** — Add unit tests (Vitest) for proxy services, admin routes, and web components alongside the existing integration tests

## 🟡 Medium

- [ ] **PWA support** — Add `manifest.json`, service worker, offline caching, install prompt for mobile/desktop
- [ ] **Push notifications** — Implement web push notifications using the existing `notification_channels` / `notification_log` schema
- [ ] **Structured logging** — Replace `console.log` with a proper logger (pino/winston) with levels, correlation IDs, JSON output
- [ ] **Input validation** — Add Zod schemas for all API request bodies
- [ ] **CSRF protection** — Add token validation on state-changing requests
- [ ] **Content Security Policy** — Add security headers (CSP, X-Frame-Options, etc.)
- [ ] **Request correlation IDs** — Generate per-request IDs and propagate through logs

## 🔵 Low

- [ ] **OpenAPI / Swagger docs** — Auto-generate API documentation from route definitions
- [ ] **Deployment guide** — Document production deployment beyond docker-compose (VPS, cloud, reverse proxy, TLS)
- [ ] **APM / metrics** — Add Prometheus metrics or similar for latency percentiles, error rates, token usage
- [ ] **Notification system** — Build out the notification engine (email, webhook, Slack) on top of existing schema
- [ ] **Docker health checks** — Add health checks for `web` and `proxy` services in docker-compose
- [ ] **Redis health check** — Add health check for Redis container

## ✅ Done

- [x] Project scaffolding (proxy + web + docker-compose)
- [x] GitHub Device OAuth flow
- [x] Chat UI with streaming responses
- [x] Markdown rendering with syntax highlighting
- [x] Session management (create, switch, delete)
- [x] Admin dashboard (connection, models, usage, sessions)
- [x] Electric animated border with connection health awareness
- [x] README with logo, badges, architecture diagram
- [x] Git repo + pushed to GitHub
- [x] Admin route auth — `sessionAuthMiddleware` on all `/api/admin/*` endpoints
- [x] API key system — create, revoke, scope enforcement, default model injection, rate limits per key
- [x] API integration test suite — 76 tests across 9 phases (auth, scopes, isolation, streaming, cross-model)
- [x] Model sync service — auto-syncs upstream Copilot model catalog to DB with change tracking
- [x] Dynamic endpoint routing — routes models to `/chat/completions` or `/responses` based on `supported_endpoints`
- [x] LLM Stats enrichment — organization, pricing, modalities, license, context window from ZeroEval API
- [x] Provider API pricing display — labeled as informational with Copilot premium multiplier context
- [x] Session source tracking — UI vs API key sessions separated; admin sidebar filters to UI-only
- [x] Removed next-auth dead dependency
- [x] Error boundaries — error.tsx for (app), (admin), and global-error.tsx
- [x] CI/CD — GitHub Actions: lint, build, test on PR; Docker publish on merge; release workflow on tags
- [x] Version-aware self-update — VERSION file, `/api/admin/version` endpoint, admin System page with upgrade UI
- [x] Provider API pricing display — labeled as informational with Copilot premium multiplier context
- [x] Session source tracking — UI vs API key sessions separated; admin sidebar filters to UI-only
