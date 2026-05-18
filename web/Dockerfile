FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build-time env vars for Next.js (NEXT_PUBLIC_* are inlined at build).
# We deliberately do NOT pass any API key here — the browser chat client
# authenticates with the user's session token (see /api/auth/login).
ARG NEXT_PUBLIC_PROXY_URL=http://localhost:3200
ENV NEXT_PUBLIC_PROXY_URL=$NEXT_PUBLIC_PROXY_URL

RUN npm run build

# --- Production stage ---
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
