FROM node:24-alpine AS builder

# pnpm version comes from package.json "packageManager" via corepack
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build-time env vars for Next.js (NEXT_PUBLIC_* are inlined at build).
# We deliberately do NOT pass any API key here — the browser chat client
# authenticates with the user's session token (see /api/auth/login).
ARG NEXT_PUBLIC_PROXY_URL=http://localhost:3200
ENV NEXT_PUBLIC_PROXY_URL=$NEXT_PUBLIC_PROXY_URL
# Repo-root VERSION is outside this build context — passed in by compose.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

RUN pnpm run build

# --- Production stage ---
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
