"use client";

import {
  CodeBlock,
  DocsHeader,
  SectionLabel,
} from "@/components/docs/parts";

export default function ReverseProxyDocsPage() {
  return (
    <div className="space-y-8">
      <DocsHeader
        title="Reverse-Proxy"
        highlight="Setup"
        description="Recipes for fronting Wingman with nginx, Caddy, or Traefik — including the SSE-buffering pitfalls and split-host layouts."
      />

      <p className="text-sm text-muted-foreground max-w-3xl">
        Wingman has two HTTP services: the Next.js web UI (default{" "}
        <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
          3000
        </code>
        ) and the Express proxy (default{" "}
        <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
          3200
        </code>
        ). Behind a reverse proxy you typically expose them on <em>one</em>{" "}
        public hostname under different path prefixes —{" "}
        <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
          /
        </code>{" "}
        goes to the web UI,{" "}
        <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
          /api/
        </code>
        and{" "}
        <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
          /health
        </code>
        and{" "}
        <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
          /openapi.json
        </code>{" "}
        go to the proxy. SSE streaming must not be buffered.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RpStep
          num={1}
          title="Decide a layout"
          body="Either keep both services on different ports of the same host (simplest, recommended) or split them onto subdomains (chat.example.com + api.example.com)."
        />
        <RpStep
          num={2}
          title="Forward streams unbuffered"
          body="Disable response buffering for /api/chat — the SSE delta stream must pass through in real time."
        />
        <RpStep
          num={3}
          title="Tell the web UI where the proxy lives"
          body="Set NEXT_PUBLIC_PROXY_URL at build time of the web app so its fetch() calls point at the public proxy URL."
        />
      </div>

      <section className="space-y-3">
        <SectionLabel>// Env vars</SectionLabel>
        <CodeBlock
          language="bash"
          code={`# .env on the host that builds the web image
NEXT_PUBLIC_PROXY_URL=https://wingman.example.com   # public URL of the proxy
INTERNAL_API_KEY=...                                # shared with the proxy
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...                    # optional, for push

# .env on the proxy
PROXY_PORT=3200
DATABASE_URL=postgres://wingman:password@db:5432/wingman
REDIS_URL=redis://redis:6379
ENCRYPTION_KEY=...                                  # 32-byte hex
INTERNAL_API_KEY=...                                # must match the web env`}
        />
        <p className="font-mono text-[11px] text-muted-foreground/80 tracking-wide">
          <strong className="text-foreground/90">Important:</strong>{" "}
          <code className="text-copilot-purple">NEXT_PUBLIC_*</code> values are
          embedded into the JS bundle at build time. Rebuild the web image
          whenever the public proxy URL changes.
        </p>
      </section>

      <section className="space-y-3">
        <SectionLabel>// nginx — single host, path-based</SectionLabel>
        <CodeBlock
          language="nginx"
          code={`# /etc/nginx/sites-available/wingman.conf
server {
  listen 443 ssl http2;
  server_name wingman.example.com;

  ssl_certificate     /etc/letsencrypt/live/wingman.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/wingman.example.com/privkey.pem;

  # ── Proxy API (port 3200) ───────────────────────────────────
  location /api/ {
    proxy_pass http://127.0.0.1:3200;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;

    # SSE — keep the stream alive and don't buffer chunks
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    chunked_transfer_encoding on;
  }

  location = /openapi.json { proxy_pass http://127.0.0.1:3200; }
  location = /health       { proxy_pass http://127.0.0.1:3200; }

  # ── Web UI (port 3000) ──────────────────────────────────────
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  client_max_body_size 25m;   # base64-encoded images on /api/chat
}`}
        />
      </section>

      <section className="space-y-3">
        <SectionLabel>// Caddy — single host, path-based</SectionLabel>
        <CodeBlock
          language="caddyfile"
          code={`wingman.example.com {
  encode zstd gzip
  request_body {
    max_size 25MB
  }

  # Streaming-safe routes to the proxy (3200)
  @proxy path /api/* /openapi.json /health
  handle @proxy {
    reverse_proxy 127.0.0.1:3200 {
      flush_interval -1        # never buffer — required for SSE
      transport http {
        read_timeout 1h
        write_timeout 1h
      }
    }
  }

  # Everything else → web UI (3000)
  handle {
    reverse_proxy 127.0.0.1:3000
  }
}`}
        />
      </section>

      <section className="space-y-3">
        <SectionLabel>// Traefik + docker-compose labels</SectionLabel>
        <CodeBlock
          language="yaml"
          code={`# docker-compose.yml fragment
services:
  proxy:
    image: wingman-proxy
    labels:
      - traefik.enable=true
      - traefik.http.routers.wingman-api.rule=Host(\`wingman.example.com\`) && (PathPrefix(\`/api\`) || Path(\`/openapi.json\`) || Path(\`/health\`))
      - traefik.http.routers.wingman-api.tls=true
      - traefik.http.routers.wingman-api.tls.certresolver=le
      - traefik.http.services.wingman-api.loadbalancer.server.port=3200
      # Disable buffering so the SSE stream flushes immediately
      - traefik.http.middlewares.no-buffer.buffering.maxRequestBodyBytes=26214400
      - traefik.http.routers.wingman-api.middlewares=no-buffer
  web:
    image: wingman-web
    environment:
      NEXT_PUBLIC_PROXY_URL: https://wingman.example.com
      INTERNAL_API_KEY: \${INTERNAL_API_KEY}
    labels:
      - traefik.enable=true
      - traefik.http.routers.wingman-web.rule=Host(\`wingman.example.com\`)
      - traefik.http.routers.wingman-web.tls=true
      - traefik.http.routers.wingman-web.tls.certresolver=le
      - traefik.http.services.wingman-web.loadbalancer.server.port=3000
      - traefik.http.routers.wingman-web.priority=1
      - traefik.http.routers.wingman-api.priority=10`}
        />
        <p className="font-mono text-[11px] text-muted-foreground/80 tracking-wide">
          Higher <code className="text-copilot-purple">priority</code> on the
          API router makes Traefik evaluate the path predicate before the
          catch-all web router.
        </p>
      </section>

      <section className="space-y-3">
        <SectionLabel>// Split-host layout (proxy on a different domain)</SectionLabel>
        <p className="text-sm text-muted-foreground max-w-3xl">
          If you prefer keeping the API on its own host (e.g.{" "}
          <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary/60 text-foreground border border-border/60">
            api.example.com
          </code>
          ), set the web UI's public URL accordingly and rely on the proxy's
          existing CORS allowlist — by default it accepts any localhost origin,
          so in production you'll want to widen it.
        </p>
        <CodeBlock
          language="bash"
          code={`# Web build
NEXT_PUBLIC_PROXY_URL=https://api.example.com

# Proxy — allow your web origin via CORS (edit proxy/src/server.ts)
#   origin: ["https://wingman.example.com", "https://api.example.com"]`}
        />
      </section>

      <section className="space-y-3">
        <SectionLabel>// Smoke tests</SectionLabel>
        <CodeBlock
          code={`# 1. Spec reachable through the proxy
curl https://wingman.example.com/openapi.json | jq .info.title

# 2. Auth + non-streaming chat
curl https://wingman.example.com/api/chat \\
  -H "Authorization: Bearer wm_yourkey" \\
  -H "Content-Type: application/json" \\
  -d '{"sessionKey":"smoke-1","message":"ping","model":"gpt-4o"}'

# 3. Streaming — confirm bytes arrive immediately, not in one batch
curl -N https://wingman.example.com/api/chat \\
  -H "Authorization: Bearer wm_yourkey" \\
  -H "Content-Type: application/json" \\
  -d '{"sessionKey":"smoke-2","message":"count to 5","stream":true}'`}
        />
        <p className="font-mono text-[11px] text-muted-foreground/80 tracking-wide">
          If the streaming call delivers the whole response in one chunk, your
          reverse proxy is buffering. Re-check{" "}
          <code className="text-copilot-purple">proxy_buffering off</code>{" "}
          (nginx) or{" "}
          <code className="text-copilot-purple">flush_interval -1</code>{" "}
          (Caddy).
        </p>
      </section>
    </div>
  );
}

function RpStep({
  num,
  title,
  body,
}: {
  num: number;
  title: string;
  body: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-background/50 px-4 py-4">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent/30 to-transparent"
      />
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent">
        Step {num}
      </p>
      <p className="text-sm font-medium mt-1">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        {body}
      </p>
    </div>
  );
}
