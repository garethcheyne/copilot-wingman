"use client";

import {
  CodeBlock,
  DocsHeader,
  EndpointCard,
  PROXY_URL,
  SectionLabel,
} from "@/components/docs/parts";

export default function ChatDocsPage() {
  return (
    <div className="space-y-6">
      <DocsHeader
        title="Chat"
        highlight="Endpoint"
        description="Send a message and receive a response from Copilot. Supports streaming via Server-Sent Events, system prompts, and image attachments."
      />

      <EndpointCard
        method="POST"
        path="/api/chat"
        description="Send a chat message in the context of a session. Subsequent calls with the same sessionKey continue the same conversation."
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
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent/40 to-transparent"
        />
        <div className="px-6 py-5 space-y-3">
          <SectionLabel>// Session Management</SectionLabel>
          <p className="text-sm text-muted-foreground">
            Sessions are keyed by{" "}
            <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-copilot-purple/15 text-copilot-purple">
              sessionKey
            </code>
            . Conversation history is maintained automatically &mdash;
            subsequent messages in the same session include previous context.
          </p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2.5">
              <span className="font-mono text-[10px] text-accent mt-1.5">▸</span>
              Use a unique{" "}
              <code className="font-mono text-xs text-foreground">sessionKey</code>{" "}
              per conversation
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
    </div>
  );
}
