"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Copy,
  Check,
  Terminal,
  Lock,
  Server,
  Heart,
  Cpu,
  FileJson,
  ExternalLink,
  Network,
} from "lucide-react";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:3200";

type Method = "GET" | "POST" | "PUT" | "DELETE";

const methodColor: Record<Method, string> = {
  GET: "bg-primary/15 text-primary border-primary/30",
  POST: "bg-copilot-green/15 text-copilot-green border-copilot-green/30",
  PUT: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  DELETE: "bg-destructive/15 text-destructive border-destructive/30",
};

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl border border-border/70 bg-background/60 backdrop-blur-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-card/40">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-copilot-green/60" />
        </div>
        <span className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground/70">
          {language}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-wider uppercase text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-copilot-green" />
              <span className="text-copilot-green">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-[13px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed scroll-sleek">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

function EndpointHeader({ method, path }: { method: Method; path: string }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] tracking-widest uppercase border ${methodColor[method]}`}
      >
        {method}
      </span>
      <code className="font-mono text-sm tracking-wider break-all">{path}</code>
    </div>
  );
}

function EndpointCard({
  method,
  path,
  description,
  children,
}: {
  method: Method;
  path: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-px ${
          method === "GET"
            ? "bg-linear-to-r from-transparent via-primary/50 to-transparent"
            : method === "POST"
            ? "bg-linear-to-r from-transparent via-copilot-green/50 to-transparent"
            : method === "PUT"
            ? "bg-linear-to-r from-transparent via-yellow-500/50 to-transparent"
            : "bg-linear-to-r from-transparent via-destructive/50 to-transparent"
        }`}
      />
      <div className="px-4 sm:px-6 py-5 space-y-4">
        <div className="space-y-2">
          <EndpointHeader method={method} path={path} />
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children && <div className="space-y-4">{children}</div>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
      {children}
    </p>
  );
}

export default function DocsPage() {
  const specUrl = `${PROXY_URL}/openapi.json`;
  const swaggerUrl = `/swagger.html?url=${encodeURIComponent(specUrl)}`;
  const swaggerEditorUrl = `https://editor.swagger.io/?url=${encodeURIComponent(
    specUrl,
  )}`;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / api docs
        </p>
        <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight leading-none">
          API <span className="text-copilot-gradient">Reference</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Public endpoints reachable with a Wingman API key — chat, model
          discovery, and health. Admin endpoints are intentionally excluded
          because they require an interactive session.
        </p>
      </div>

      {/* Base URL + Auth — two-up hero row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-primary" />
              <p className="label-mono">// Base URL</p>
            </div>
            <CodeBlock code={PROXY_URL} />
            <p className="font-mono text-[11px] text-muted-foreground/80 tracking-wide">
              All endpoints are relative to this host. The proxy forwards to
              api.githubcopilot.com.
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent" />
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-copilot-purple" />
              <p className="label-mono">// Authentication</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Send a Wingman API key (prefix{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-copilot-purple/15 text-copilot-purple">
                wm_
              </code>
              ) as either{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-copilot-purple/15 text-copilot-purple">
                Authorization: Bearer
              </code>{" "}
              or{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-copilot-purple/15 text-copilot-purple">
                X-Api-Key
              </code>
              .
            </p>
            <CodeBlock
              code={`curl ${PROXY_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer wm_..." \\
  -d '{"sessionKey": "my-session", "message": "Hello"}'`}
            />
            <p className="font-mono text-[11px] text-muted-foreground/80 tracking-wide">
              Generate keys under <code className="text-copilot-purple">Admin → API Keys</code>.
              Each key can be scoped to specific models.
            </p>
          </div>
        </div>
      </div>

      {/* Swagger UI — interactive */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <SectionLabel>// Interactive Spec (Swagger UI)</SectionLabel>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Live OpenAPI 3.1 spec served by the proxy. Try requests against
              your local proxy, copy URLs to Postman, or import into your tool
              of choice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={specUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border/70 bg-card/60 hover:bg-card hover:border-primary/40 transition-colors font-mono tracking-wider uppercase text-[10px]"
            >
              <FileJson className="w-3 h-3" />
              openapi.json
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
            <a
              href={swaggerEditorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border/70 bg-card/60 hover:bg-card hover:border-copilot-purple/40 transition-colors font-mono tracking-wider uppercase text-[10px]"
            >
              <ExternalLink className="w-3 h-3" />
              Editor.swagger.io
            </a>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-green/40 to-transparent" />
          <iframe
            title="Swagger UI"
            src={swaggerUrl}
            className="w-full h-180 bg-transparent"
          />
        </div>
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">
          // Swagger UI loads from unpkg.com — needs internet on first view; the
          spec itself is fully local.
        </p>
      </section>

      {/* Endpoint reference */}
      <div className="space-y-4">
        <SectionLabel>// Endpoint Reference</SectionLabel>
        <Tabs defaultValue="chat">
          <TabsList className="bg-card/60 backdrop-blur-md border border-border/70 p-1 h-auto flex-wrap">
            <TabsTrigger
              value="chat"
              className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
            >
              <Terminal className="w-3 h-3 mr-1.5" /> Chat
            </TabsTrigger>
            <TabsTrigger
              value="models"
              className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-copilot-purple/15 data-[state=active]:text-copilot-purple"
            >
              <Cpu className="w-3 h-3 mr-1.5" /> Models
            </TabsTrigger>
            <TabsTrigger
              value="health"
              className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-copilot-green/15 data-[state=active]:text-copilot-green"
            >
              <Heart className="w-3 h-3 mr-1.5" /> Health
            </TabsTrigger>
          </TabsList>

          {/* CHAT */}
          <TabsContent value="chat" className="mt-6 space-y-5">
            <EndpointCard
              method="POST"
              path="/api/chat"
              description="Send a message and receive a response from Copilot. Supports streaming via Server-Sent Events."
            >
              <div className="space-y-2">
                <SectionLabel>Request Body</SectionLabel>
                <CodeBlock
                  language="json"
                  code={`{
  "sessionKey": "unique-session-id",
  "message": "What is TypeScript?",
  "model": "gpt-4o",            // optional, defaults to the API key's default_model
  "systemPrompt": "You are...", // optional, set on first message in a session
  "stream": true,               // optional, enables SSE streaming
  "images": ["data:image/png;base64,..."]
}`}
                />
              </div>

              <div className="space-y-2">
                <SectionLabel>Response · Non-streaming</SectionLabel>
                <CodeBlock
                  language="json"
                  code={`{
  "sessionId": "uuid",
  "message": "TypeScript is a typed superset of JavaScript..."
}`}
                />
              </div>

              <div className="space-y-2">
                <SectionLabel>Response · Streaming (SSE)</SectionLabel>
                <CodeBlock
                  language="sse"
                  code={`data: {"choices":[{"delta":{"content":"Type"}}]}
data: {"choices":[{"delta":{"content":"Script"}}]}
data: {"choices":[{"delta":{"content":" is"}}]}
...
data: [DONE]`}
                />
              </div>

              <div className="space-y-2">
                <SectionLabel>Example · curl</SectionLabel>
                <CodeBlock
                  code={`# One-shot
curl -X POST ${PROXY_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer wm_yourkeyhere" \\
  -d '{
    "sessionKey": "test-session-1",
    "message": "Explain async/await in 2 sentences",
    "model": "gpt-4o"
  }'

# Streaming
curl -X POST ${PROXY_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer wm_yourkeyhere" \\
  -d '{
    "sessionKey": "test-session-1",
    "message": "Write a haiku about code",
    "stream": true
  }'`}
                />
              </div>

              <div className="space-y-2">
                <SectionLabel>Example · TypeScript</SectionLabel>
                <CodeBlock
                  language="typescript"
                  code={`const response = await fetch("${PROXY_URL}/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${process.env.WINGMAN_API_KEY}\`,
  },
  body: JSON.stringify({
    sessionKey: "my-app-session",
    message: "Help me refactor this function",
    model: "claude-sonnet-4",
    stream: false,
  }),
});

const data = await response.json();
console.log(data.message);`}
                />
              </div>

              <div className="space-y-2">
                <SectionLabel>Example · Python</SectionLabel>
                <CodeBlock
                  language="python"
                  code={`import requests

response = requests.post(
    "${PROXY_URL}/api/chat",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer wm_yourkeyhere",
    },
    json={
        "sessionKey": "python-session",
        "message": "Write a quicksort in Python",
        "model": "gpt-4o",
    },
)

data = response.json()
print(data["message"])`}
                />
              </div>
            </EndpointCard>

            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
              <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent/40 to-transparent" />
              <div className="px-6 py-5 space-y-3">
                <SectionLabel>// Session Management</SectionLabel>
                <p className="text-sm text-muted-foreground">
                  Sessions are keyed by{" "}
                  <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-copilot-purple/15 text-copilot-purple">
                    sessionKey
                  </code>
                  . Conversation history is maintained automatically &mdash;
                  subsequent messages in the same session include previous
                  context.
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-[10px] text-accent mt-1.5">▸</span>
                    Use a unique <code className="font-mono text-xs text-foreground">sessionKey</code> per conversation
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-[10px] text-accent mt-1.5">▸</span>
                    System prompt is set on first message and persists for the session
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-[10px] text-accent mt-1.5">▸</span>
                    History is trimmed to fit within an 8,000 token context window
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono text-[10px] text-accent mt-1.5">▸</span>
                    Sessions are persisted in PostgreSQL
                  </li>
                </ul>
              </div>
            </div>
          </TabsContent>

          {/* MODELS */}
          <TabsContent value="models" className="mt-6 space-y-4">
            <EndpointCard
              method="GET"
              path="/api/models"
              description="Returns the models available to the calling API key. If the key has no scope restrictions, every active upstream model is returned."
            >
              <div className="space-y-2">
                <SectionLabel>Response</SectionLabel>
                <CodeBlock
                  language="json"
                  code={`{
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "vendor": "OpenAI",
      "version": "2024-08-06",
      "preview": false,
      "chat_enabled": true,
      "supported_endpoints": ["/chat/completions"],
      "capabilities": {
        "type": "chat",
        "family": "gpt-4o",
        "context_window": 128000,
        "max_output_tokens": 16384
      }
    }
  ],
  "default_model": "gpt-4o",
  "total": 1,
  "chat_capable": 1
}`}
                />
              </div>
              <div className="space-y-2">
                <SectionLabel>Example · curl</SectionLabel>
                <CodeBlock
                  code={`curl ${PROXY_URL}/api/models \\
  -H "Authorization: Bearer wm_yourkeyhere"`}
                />
              </div>
            </EndpointCard>
          </TabsContent>

          {/* HEALTH */}
          <TabsContent value="health" className="mt-6 space-y-4">
            <EndpointCard
              method="GET"
              path="/health"
              description="Liveness + dependency check. No auth required. Returns 200 when database and upstream GitHub are both reachable; 503 otherwise."
            >
              <CodeBlock code={`curl ${PROXY_URL}/health`} />
              <CodeBlock
                language="json"
                code={`{
  "status": "healthy",
  "checks": {
    "database": "connected",
    "github": { "status": "connected", "username": "octocat" }
  },
  "timestamp": "2025-05-16T12:34:56.789Z"
}`}
              />
            </EndpointCard>
          </TabsContent>
        </Tabs>
      </div>

      {/* Reverse-proxy guide */}
      <ReverseProxyGuide />
    </div>
  );
}

function ReverseProxyGuide() {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Network className="w-3.5 h-3.5 text-accent" />
        <SectionLabel>// Reverse-Proxy Setup</SectionLabel>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent/40 to-transparent" />
        <div className="px-4 sm:px-6 py-5 space-y-5">
          <p className="text-sm text-muted-foreground max-w-3xl">
            Wingman has two HTTP services: the Next.js web UI (default
            <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
              3000
            </code>
            ) and the Express proxy (default
            <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
              3200
            </code>
            ). Behind a reverse proxy you typically expose them on
            <em> one </em>public hostname under different path prefixes —
            <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
              /
            </code>
            goes to the web UI,
            <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
              /api/
            </code>
            and
            <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
              /health
            </code>
            and
            <code className="font-mono text-xs px-1.5 py-0.5 rounded mx-1 bg-secondary/60 text-foreground border border-border/60">
              /openapi.json
            </code>
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

          <div className="space-y-3">
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
              <code className="text-copilot-purple">NEXT_PUBLIC_*</code> values
              are embedded into the JS bundle at build time. Rebuild the web
              image whenever the public proxy URL changes.
            </p>
          </div>

          <div className="space-y-3">
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
          </div>

          <div className="space-y-3">
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
          </div>

          <div className="space-y-3">
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
          </div>

          <div className="space-y-3">
            <SectionLabel>// Split-host layout (proxy on a different domain)</SectionLabel>
            <p className="text-sm text-muted-foreground max-w-3xl">
              If you prefer keeping the API on its own host (e.g.{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary/60 text-foreground border border-border/60">
                api.example.com
              </code>{" "}
              ), set the web UI's public URL accordingly and rely on the
              proxy's existing CORS allowlist — by default it accepts any
              localhost origin, so in production you'll want to widen it.
            </p>
            <CodeBlock
              language="bash"
              code={`# Web build
NEXT_PUBLIC_PROXY_URL=https://api.example.com

# Proxy — allow your web origin via CORS (edit proxy/src/server.ts)
#   origin: ["https://wingman.example.com", "https://api.example.com"]`}
            />
          </div>

          <div className="space-y-3">
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
              If the streaming call delivers the whole response in one chunk,
              your reverse proxy is buffering. Re-check{" "}
              <code className="text-copilot-purple">proxy_buffering off</code>{" "}
              (nginx) or{" "}
              <code className="text-copilot-purple">flush_interval -1</code>{" "}
              (Caddy).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RpStep({ num, title, body }: { num: number; title: string; body: string }) {
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
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </div>
  );
}
