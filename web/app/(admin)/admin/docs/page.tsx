"use client";

import Link from "next/link";
import {
  Lock,
  Server,
  FileJson,
  Terminal,
  Cpu,
  Heart,
  Network,
  ArrowRight,
} from "lucide-react";
import {
  CodeBlock,
  DocsHeader,
  PROXY_URL,
  SectionLabel,
} from "@/components/docs/parts";

interface SectionLink {
  href: string;
  label: string;
  description: string;
  icon: typeof Server;
  accent: "primary" | "purple" | "green" | "accent";
}

const sections: SectionLink[] = [
  {
    href: "/admin/docs/spec",
    label: "Interactive Spec",
    description: "Swagger UI loaded from /openapi.json — try requests, copy URLs, export.",
    icon: FileJson,
    accent: "purple",
  },
  {
    href: "/admin/docs/chat",
    label: "Chat",
    description: "POST /api/chat — one-shot and streaming chat completions with examples in 3 languages.",
    icon: Terminal,
    accent: "primary",
  },
  {
    href: "/admin/docs/models",
    label: "Models",
    description: "GET /api/models — models reachable with the calling API key.",
    icon: Cpu,
    accent: "purple",
  },
  {
    href: "/admin/docs/health",
    label: "Health",
    description: "GET /health — liveness + dependency check. No auth.",
    icon: Heart,
    accent: "green",
  },
  {
    href: "/admin/docs/reverse-proxy",
    label: "Reverse-Proxy Setup",
    description: "nginx, Caddy and Traefik recipes — SSE-safe, with smoke tests.",
    icon: Network,
    accent: "accent",
  },
];

const accentLine: Record<SectionLink["accent"], string> = {
  primary: "via-primary/50",
  purple: "via-copilot-purple/50",
  green: "via-copilot-green/50",
  accent: "via-accent/50",
};

const accentIcon: Record<SectionLink["accent"], string> = {
  primary: "text-primary",
  purple: "text-copilot-purple",
  green: "text-copilot-green",
  accent: "text-accent",
};

export default function DocsIndexPage() {
  return (
    <div className="space-y-10">
      <DocsHeader
        title="API"
        highlight="Reference"
        description="Public endpoints reachable with a Wingman API key — chat, model discovery, and health. Admin endpoints are intentionally excluded because they require an interactive session."
      />

      {/* Base URL + Auth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
          />
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
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent"
          />
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
              Generate keys under{" "}
              <code className="text-copilot-purple">Admin → API Keys</code>.
              Each key can be scoped to specific models.
            </p>
          </div>
        </div>
      </div>

      {/* Section index */}
      <section className="space-y-3">
        <SectionLabel>// Sections</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md hover:border-border transition-colors"
            >
              <div
                aria-hidden
                className={`absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent ${accentLine[s.accent]} to-transparent`}
              />
              <div className="px-5 py-4 flex items-start gap-3">
                <span
                  className={`mt-0.5 w-9 h-9 rounded-lg bg-background/60 border border-border/60 flex items-center justify-center ${accentIcon[s.accent]}`}
                >
                  <s.icon className="w-4 h-4" strokeWidth={1.8} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{s.label}</p>
                    <code className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
                      {s.href}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {s.description}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 mt-1.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
