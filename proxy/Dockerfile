FROM node:24-alpine AS builder

# pnpm version comes from package.json "packageManager" via corepack
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm run build

# --- Production stage ---
FROM node:24-alpine

# pnpm version comes from package.json "packageManager" via corepack
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# poppler-utils provides pdftoppm for PDF→PNG conversion
RUN apk add --no-cache poppler-utils

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

# Migration runner + migration files. These ship with the runtime image so
# `docker compose exec proxy node scripts/migrate.mjs` (called by
# upgradeWingman.sh) finds everything it needs.
COPY scripts/ ./scripts/
COPY src/db/migrations/ ./src/db/migrations/
COPY src/db/schema.sql ./src/db/schema.sql

ARG APP_VERSION=0.0.0
RUN echo "$APP_VERSION" > ./VERSION

ENV NODE_ENV=production
ENV PROXY_PORT=3200

EXPOSE 3200

# Apply pending migrations before serving (idempotent; aborts start on failure)
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node dist/server.js"]
