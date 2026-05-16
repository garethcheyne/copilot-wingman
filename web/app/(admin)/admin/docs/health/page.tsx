"use client";

import {
  CodeBlock,
  DocsHeader,
  EndpointCard,
  PROXY_URL,
  SectionLabel,
} from "@/components/docs/parts";

export default function HealthDocsPage() {
  return (
    <div className="space-y-6">
      <DocsHeader
        title="Health"
        highlight="Endpoint"
        description="Liveness + dependency check used by load balancers, uptime monitors, and the in-app connection indicator. No auth required."
      />

      <EndpointCard
        method="GET"
        path="/health"
        description="Returns 200 when database and upstream GitHub are both reachable; 503 otherwise."
      >
        <div className="space-y-2">
          <SectionLabel>Example · curl</SectionLabel>
          <CodeBlock code={`curl ${PROXY_URL}/health`} />
        </div>

        <div className="space-y-2">
          <SectionLabel>Response · Healthy (200)</SectionLabel>
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
        </div>

        <div className="space-y-2">
          <SectionLabel>Response · Unhealthy (503)</SectionLabel>
          <CodeBlock
            language="json"
            code={`{
  "status": "unhealthy",
  "checks": {
    "database": "unreachable",
    "github": { "status": "error", "error": "401 Bad credentials" }
  },
  "timestamp": "2025-05-16T12:34:56.789Z"
}`}
          />
        </div>
      </EndpointCard>
    </div>
  );
}
