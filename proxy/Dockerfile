FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Production stage ---
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

ARG APP_VERSION=0.0.0
RUN echo "$APP_VERSION" > ./VERSION

ENV NODE_ENV=production
ENV PROXY_PORT=3200

EXPOSE 3200

CMD ["node", "dist/server.js"]
