"use client";

import {
  CodeBlock,
  DocsHeader,
  EndpointCard,
  PROXY_URL,
  SectionLabel,
} from "@/components/docs/parts";

export default function ModelsDocsPage() {
  return (
    <div className="space-y-6">
      <DocsHeader
        title="Models"
        highlight="Endpoint"
        description="Discover which models the calling API key can use. Scoped automatically — keys without a scope list see every active upstream model."
      />

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

        <div className="space-y-2">
          <SectionLabel>Example · TypeScript</SectionLabel>
          <CodeBlock
            language="typescript"
            code={`const res = await fetch("${PROXY_URL}/api/models", {
  headers: { Authorization: \`Bearer \${process.env.WINGMAN_API_KEY}\` },
});
const { models, default_model } = await res.json();
console.log(\`\${models.length} models available, default \${default_model}\`);`}
          />
        </div>
      </EndpointCard>
    </div>
  );
}
