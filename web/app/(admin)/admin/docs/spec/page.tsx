"use client";

import { FileJson, ExternalLink } from "lucide-react";
import { DocsHeader, PROXY_URL, SectionLabel } from "@/components/docs/parts";

export default function SpecPage() {
  const specUrl = `${PROXY_URL}/openapi.json`;
  const swaggerUrl = `/swagger.html?url=${encodeURIComponent(specUrl)}`;
  const swaggerEditorUrl = `https://editor.swagger.io/?url=${encodeURIComponent(
    specUrl,
  )}`;

  return (
    <div className="space-y-6">
      <DocsHeader
        title="Interactive"
        highlight="Spec"
        description="Live OpenAPI 3.1 spec served by the proxy. Try requests against your local proxy, copy URLs to Postman, or import into your tool of choice."
      />

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

      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-green/40 to-transparent"
        />
        <iframe
          title="Swagger UI"
          src={swaggerUrl}
          className="w-full h-[80vh] min-h-120 bg-transparent"
        />
      </div>

      <p className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">
        // Swagger UI loads from unpkg.com — needs internet on first view; the
        spec itself is fully local.
      </p>

      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
        />
        <div className="px-5 py-4 space-y-2">
          <SectionLabel>// Tip</SectionLabel>
          <p className="text-sm text-muted-foreground">
            Paste{" "}
            <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary/60 text-foreground border border-border/60">
              {specUrl}
            </code>{" "}
            into Postman ({" "}
            <em>Import → Link</em>) or your IDE's OpenAPI extension to get
            request scaffolding and typed client generation against your local
            proxy.
          </p>
        </div>
      </div>
    </div>
  );
}
