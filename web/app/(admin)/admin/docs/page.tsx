"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Terminal, Lock, Server, Heart } from "lucide-react";

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
      {/* terminal chrome */}
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
      <code className="font-mono text-sm tracking-wider">{path}</code>
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
      <div className="px-6 py-5 space-y-4">
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
  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / api docs
        </p>
        <h1 className="text-4xl font-display font-bold tracking-tight leading-none">
          API <span className="text-copilot-gradient">Reference</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg">
          How to talk to the Wingman proxy &mdash; endpoints, auth headers, request shapes, copy-paste examples in three languages.
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
              All endpoints relative to this host. Proxy forwards to api.githubcopilot.com.
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
              Chat endpoints require an internal API key via{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-copilot-purple/15 text-copilot-purple">
                X-Api-Key
              </code>
              . Admin endpoints are localhost-only.
            </p>
            <CodeBlock
              code={`curl ${PROXY_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: YOUR_INTERNAL_API_KEY" \\
  -d '{"sessionKey": "my-session", "message": "Hello"}'`}
            />
            <p className="font-mono text-[11px] text-muted-foreground/80 tracking-wide">
              Set <code className="text-copilot-purple">INTERNAL_API_KEY</code> in proxy <code className="text-copilot-purple">.env</code>. If unset, auth is skipped (dev mode).
            </p>
          </div>
        </div>
      </div>

      {/* Endpoint reference */}
      <div className="space-y-4">
        <SectionLabel>// Endpoint Reference</SectionLabel>
        <Tabs defaultValue="chat">
          <TabsList className="bg-card/60 backdrop-blur-md border border-border/70 p-1 h-auto">
            <TabsTrigger
              value="chat"
              className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
            >
              <Terminal className="w-3 h-3 mr-1.5" /> Chat
            </TabsTrigger>
            <TabsTrigger
              value="admin"
              className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-copilot-purple/15 data-[state=active]:text-copilot-purple"
            >
              <Server className="w-3 h-3 mr-1.5" /> Admin
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
  "model": "gpt-4o",            // optional, defaults to admin setting
  "systemPrompt": "You are...", // optional, set on first message
  "stream": true                // optional, enables SSE streaming
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
                  code={`# Non-streaming
curl -X POST ${PROXY_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: dev-internal-key" \\
  -d '{
    "sessionKey": "test-session-1",
    "message": "Explain async/await in 2 sentences",
    "model": "gpt-4o"
  }'

# Streaming
curl -X POST ${PROXY_URL}/api/chat \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: dev-internal-key" \\
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
    "X-Api-Key": process.env.INTERNAL_API_KEY,
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
        "X-Api-Key": "dev-internal-key",
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
                  . Conversation history is maintained automatically &mdash; subsequent messages in the same session include
                  previous context.
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

          {/* ADMIN */}
          <TabsContent value="admin" className="mt-6 space-y-4">
            <EndpointCard method="GET" path="/api/admin/connection" description="Returns the current GitHub OAuth connection status.">
              <CodeBlock code={`curl ${PROXY_URL}/api/admin/connection`} />
            </EndpointCard>

            <EndpointCard method="POST" path="/api/admin/connection/test" description="Tests the stored OAuth token against GitHub and Copilot APIs.">
              <CodeBlock code={`curl -X POST ${PROXY_URL}/api/admin/connection/test`} />
            </EndpointCard>

            <EndpointCard method="POST" path="/api/admin/connection/ping" description="Sends a real message to Copilot and returns the response with latency.">
              <CodeBlock code={`curl -X POST ${PROXY_URL}/api/admin/connection/ping`} />
            </EndpointCard>

            <EndpointCard method="POST" path="/api/admin/connection/oauth/start" description="Starts the GitHub device OAuth flow. Returns a user code to enter at GitHub.">
              <CodeBlock code={`curl -X POST ${PROXY_URL}/api/admin/connection/oauth/start`} />
              <CodeBlock
                language="json"
                code={`{
  "userCode": "ABCD-1234",
  "verificationUri": "https://github.com/login/device",
  "deviceCode": "...",
  "expiresIn": 899,
  "interval": 5
}`}
              />
            </EndpointCard>

            <EndpointCard method="POST" path="/api/admin/connection/oauth/poll" description={`Polls for OAuth completion. Call repeatedly until status is "success" or "expired".`}>
              <CodeBlock
                code={`curl -X POST ${PROXY_URL}/api/admin/connection/oauth/poll \\
  -H "Content-Type: application/json" \\
  -d '{"deviceCode": "..."}'`}
              />
            </EndpointCard>

            <EndpointCard method="GET" path="/api/admin/models" description="Returns all available Copilot models with capabilities, context limits, and categories.">
              <CodeBlock code={`curl ${PROXY_URL}/api/admin/models`} />
            </EndpointCard>

            <EndpointCard method="GET" path="/api/admin/account" description="Returns Copilot plan info, quotas, and enabled features.">
              <CodeBlock code={`curl ${PROXY_URL}/api/admin/account`} />
            </EndpointCard>

            <EndpointCard method="GET" path="/api/admin/settings" description="Returns all app settings (e.g., default_model).">
              <CodeBlock code={`curl ${PROXY_URL}/api/admin/settings`} />
            </EndpointCard>

            <EndpointCard method="PUT" path="/api/admin/settings/:key" description="Update a setting. Currently supports default_model.">
              <CodeBlock
                code={`curl -X PUT ${PROXY_URL}/api/admin/settings/default_model \\
  -H "Content-Type: application/json" \\
  -d '{"value": "claude-sonnet-4"}'`}
              />
            </EndpointCard>
          </TabsContent>

          {/* HEALTH */}
          <TabsContent value="health" className="mt-6 space-y-4">
            <EndpointCard method="GET" path="/health" description="Health check endpoint. No authentication required.">
              <CodeBlock code={`curl ${PROXY_URL}/health`} />
              <CodeBlock language="json" code={`{ "status": "ok", "uptime": 12345 }`} />
            </EndpointCard>
          </TabsContent>
        </Tabs>
      </div>

      {/* Architecture */}
      <section className="space-y-3">
        <SectionLabel>// Architecture</SectionLabel>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent" />
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Wingman sits between your application and the GitHub Copilot API:
            </p>
            <pre className="rounded-xl border border-border/60 bg-background/50 backdrop-blur-md px-5 py-4 text-[12px] font-mono overflow-x-auto leading-relaxed text-foreground/80 scroll-sleek">
{`Your App ──▶ Wingman (port 3200) ──▶ GitHub Copilot API
                │
                ├── OAuth token management (encrypted in PostgreSQL)
                ├── Session / conversation history
                ├── Context window management (8k token budget)
                ├── Rate limiting
                └── Model selection & routing`}
            </pre>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] text-copilot-purple mt-1.5">▸</span>
                <span>
                  <strong className="text-foreground font-medium">Proxy:</strong> Express 5 + TypeScript on port 3200
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] text-copilot-purple mt-1.5">▸</span>
                <span>
                  <strong className="text-foreground font-medium">Database:</strong> PostgreSQL (sessions, messages, tokens, settings)
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] text-copilot-purple mt-1.5">▸</span>
                <span>
                  <strong className="text-foreground font-medium">Auth:</strong> GitHub Device OAuth flow (same as VS Code Copilot)
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] text-copilot-purple mt-1.5">▸</span>
                <span>
                  <strong className="text-foreground font-medium">Token exchange:</strong> GitHub OAuth token &rarr; Copilot JWT (auto-refreshed)
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono text-[10px] text-copilot-purple mt-1.5">▸</span>
                <span>
                  <strong className="text-foreground font-medium">Headers:</strong> Mimics VS Code Copilot extension (
                  <code className="font-mono text-xs">Copilot-Integration-Id: vscode-chat</code>)
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
