"use client";

import { Copy, Check } from "lucide-react";
import { useCopy } from "@/hooks/use-copy";

export const PROXY_URL =
  process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:3200";

export type Method = "GET" | "POST" | "PUT" | "DELETE";

const methodColor: Record<Method, string> = {
  GET: "bg-primary/15 text-primary border-primary/30",
  POST: "bg-copilot-green/15 text-copilot-green border-copilot-green/30",
  PUT: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  DELETE: "bg-destructive/15 text-destructive border-destructive/30",
};

export function CodeBlock({
  code,
  language = "bash",
}: {
  code: string;
  language?: string;
}) {
  const { copied, copy } = useCopy();

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
          onClick={() => copy(code)}
          aria-label="Copy code"
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

function EndpointHeader({
  method,
  path,
}: {
  method: Method;
  path: string;
}) {
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

export function EndpointCard({
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

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
      {children}
    </p>
  );
}

export function DocsHeader({
  title,
  highlight,
  description,
}: {
  title: string;
  highlight?: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
        admin / api docs
      </p>
      <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight leading-none">
        {title}
        {highlight && (
          <>
            {" "}
            <span className="text-copilot-gradient">{highlight}</span>
          </>
        )}
      </h1>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xl">{description}</p>
      )}
    </div>
  );
}
