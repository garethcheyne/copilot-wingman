FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.confirmModulesPureness=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm run build

# --- Production stage ---
FROM node:24-alpine

RUN corepack enable && corepack prepare pnpm@10 --activate

# poppler-utils provides pdftoppm for PDF→PNG conversion
RUN apk add --no-cache poppler-utils

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --config.confirmModulesPureness=false

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

CMD ["node", "dist/server.js"]
