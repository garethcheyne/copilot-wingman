#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  upgradeWingman.sh — safe upgrade for a Docker-Compose deployment of Wingman
# ─────────────────────────────────────────────────────────────────────────────
#  WHAT IT DOES
#    1. Pulls the latest code from the current git branch
#    2. Backs up the Postgres database to ./backups/wingman-YYYYmmdd-HHMMSS.sql.gz
#    3. Rebuilds and restarts ONLY the app containers (web + proxy)
#       — postgres and redis are left running so their named volumes (and
#       therefore your data) are never touched
#    4. Applies schema.sql additively (all statements use IF NOT EXISTS / ADD
#       COLUMN IF NOT EXISTS, so it is safe to re-run on every upgrade)
#    5. Health-checks the proxy and prints the new version
#
#  WHAT IT WILL NEVER DO
#    • docker compose down -v        (would destroy volumes)
#    • docker volume rm              (would destroy data)
#    • drop / truncate / delete from any table
#    • recreate the postgres or redis container
#
#  USAGE
#    ./upgradeWingman.sh                 # full upgrade with backup
#    ./upgradeWingman.sh --no-pull       # skip `git pull`
#    ./upgradeWingman.sh --no-backup     # skip db backup (not recommended)
#    ./upgradeWingman.sh --skip-build    # restart only, no rebuild
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'
  C_BLUE=$'\033[34m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_BLUE=""; C_YELLOW=""; C_RED=""; C_CYAN=""
fi

step()  { echo; echo "${C_CYAN}${C_BOLD}▸ $*${C_RESET}"; }
ok()    { echo "  ${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "  ${C_YELLOW}!${C_RESET} $*"; }
fail()  { echo "  ${C_RED}✗${C_RESET} $*" >&2; }
info()  { echo "  ${C_DIM}$*${C_RESET}"; }

# ── Flags ────────────────────────────────────────────────────────────────────
DO_PULL=1
DO_BACKUP=1
DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-pull)    DO_PULL=0 ;;
    --no-backup)  DO_BACKUP=0 ;;
    --skip-build) DO_BUILD=0 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *)
      fail "Unknown flag: $arg"; exit 2 ;;
  esac
done

# ── Locate repo root (this script lives at the root) ────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Pick the right docker compose command ───────────────────────────────────
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  fail "docker / docker compose not found on PATH"; exit 1
fi

# ── Sanity checks ───────────────────────────────────────────────────────────
[[ -f docker-compose.yml ]] || { fail "docker-compose.yml not found in $SCRIPT_DIR"; exit 1; }
[[ -f VERSION ]]            || { fail "VERSION file not found";                       exit 1; }

OLD_VERSION="$(tr -d '\r\n' < VERSION)"

cat <<HEADER

${C_BOLD}╔══════════════════════════════════════════════════════════════╗${C_RESET}
${C_BOLD}║                  Wingman — Safe Upgrade                       ║${C_RESET}
${C_BOLD}╚══════════════════════════════════════════════════════════════╝${C_RESET}
  ${C_DIM}repo:${C_RESET}    $SCRIPT_DIR
  ${C_DIM}compose:${C_RESET} $DC
  ${C_DIM}version:${C_RESET} ${C_BLUE}${OLD_VERSION}${C_RESET}
  ${C_DIM}backup:${C_RESET}  $([[ $DO_BACKUP -eq 1 ]] && echo enabled || echo "${C_YELLOW}disabled${C_RESET}")
  ${C_DIM}pull:${C_RESET}    $([[ $DO_PULL   -eq 1 ]] && echo enabled || echo disabled)
  ${C_DIM}build:${C_RESET}   $([[ $DO_BUILD  -eq 1 ]] && echo enabled || echo skipped)
HEADER

# ─────────────────────────────────────────────────────────────────────────────
# 1. Pull latest code
# ─────────────────────────────────────────────────────────────────────────────
if [[ $DO_PULL -eq 1 ]]; then
  step "1/6  Pulling latest code"
  if [[ -d .git ]]; then
    if ! git diff --quiet || ! git diff --cached --quiet; then
      warn "Working tree has uncommitted changes — git pull may fail."
    fi
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    info "branch: $BRANCH"
    git pull --ff-only
    ok "code updated"
  else
    warn "Not a git repo, skipping pull"
  fi
else
  step "1/6  Pull — ${C_YELLOW}skipped${C_RESET}"
fi

NEW_VERSION="$(tr -d '\r\n' < VERSION)"
if [[ "$OLD_VERSION" != "$NEW_VERSION" ]]; then
  info "VERSION: ${C_BLUE}${OLD_VERSION}${C_RESET} → ${C_GREEN}${NEW_VERSION}${C_RESET}"
else
  info "VERSION unchanged ($NEW_VERSION)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Backup the database (mandatory unless --no-backup)
# ─────────────────────────────────────────────────────────────────────────────
step "2/6  Database backup"
if [[ $DO_BACKUP -eq 1 ]]; then
  mkdir -p backups
  TS="$(date +%Y%m%d-%H%M%S)"
  BACKUP="backups/wingman-${TS}.sql.gz"

  if $DC ps --status running postgres >/dev/null 2>&1 \
       && $DC ps --status running postgres | grep -q postgres; then
    info "dumping postgres → $BACKUP"
    # Use exec (not run) so we go through the live container with its env
    if $DC exec -T postgres pg_dump -U wingman -d wingman \
         --clean --if-exists --quote-all-identifiers \
         | gzip -9 > "$BACKUP"; then
      SIZE="$(du -h "$BACKUP" 2>/dev/null | awk '{print $1}')"
      ok "backup saved (${SIZE:-unknown size})"
    else
      fail "pg_dump failed — refusing to continue. Use --no-backup to override."
      exit 1
    fi
  else
    warn "postgres container not running — nothing to back up (first install?)"
  fi
else
  warn "Backup skipped (--no-backup). You are operating without a safety net."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Rebuild + restart ONLY the app containers
#    NEVER touch postgres / redis — their volumes hold persistent state.
# ─────────────────────────────────────────────────────────────────────────────
step "3/6  Rebuild app containers"
APP_SERVICES=(web proxy)

if [[ $DO_BUILD -eq 1 ]]; then
  info "building: ${APP_SERVICES[*]}"
  $DC build "${APP_SERVICES[@]}"
  ok "images built"
else
  info "build skipped"
fi

step "4/6  Restart app containers"
# `up -d` is idempotent — it will recreate web/proxy if the image hash changed
# and leave postgres/redis (with their volumes) completely alone.
$DC up -d "${APP_SERVICES[@]}"
ok "web + proxy are up"

# Make sure DB and Redis are also running (they should already be; this is
# a safety net that NEVER destroys their volumes).
$DC up -d postgres redis >/dev/null
ok "postgres + redis verified running"

# ─────────────────────────────────────────────────────────────────────────────
# 5. Apply schema migrations (additive — uses IF NOT EXISTS everywhere)
# ─────────────────────────────────────────────────────────────────────────────
step "5/6  Apply schema migrations"
# Wait for postgres to accept connections
for i in {1..30}; do
  if $DC exec -T postgres pg_isready -U wingman -d wingman >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Run inside the proxy container so it picks up the bundled migration script
# and DATABASE_URL from compose env.
if $DC exec -T proxy node scripts/apply-migration.mjs; then
  ok "schema applied"
else
  fail "schema migration failed — investigate, then re-run."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Health check
# ─────────────────────────────────────────────────────────────────────────────
step "6/6  Health check"
PROXY_PORT="${PROXY_PORT:-3200}"
HEALTH_URL="http://localhost:${PROXY_PORT}/api/health"
WEB_PORT="${WEB_PORT:-3000}"

# Give the proxy a moment to bind its port
for i in {1..20}; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  RUNNING_VERSION="$(curl -fsS "http://localhost:${PROXY_PORT}/api/version" 2>/dev/null \
                     | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
  ok "proxy responded at ${HEALTH_URL}"
  [[ -n "${RUNNING_VERSION:-}" ]] && info "running version: ${C_GREEN}${RUNNING_VERSION}${C_RESET}"
else
  warn "Health endpoint did not respond. Check: ${C_DIM}$DC logs proxy${C_RESET}"
fi

cat <<DONE

${C_GREEN}${C_BOLD}✔ Upgrade complete${C_RESET}
  ${C_DIM}web:${C_RESET}    http://localhost:${WEB_PORT}
  ${C_DIM}proxy:${C_RESET}  http://localhost:${PROXY_PORT}
  ${C_DIM}backup:${C_RESET} $([[ $DO_BACKUP -eq 1 ]] && echo "$BACKUP" || echo "(skipped)")

DONE
