import { getCopilotToken, invalidateTokenCache } from './copilot-token.js';
import { pool } from '../db/client.js';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
}

const COPILOT_BASE = 'https://api.githubcopilot.com';
const COPILOT_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'GithubCopilot/1.300.0',
  'Copilot-Integration-Id': 'vscode-chat',
  'Editor-Version': 'vscode/1.100.0',
  'Editor-Plugin-Version': 'copilot-chat/0.28.0',
  'Openai-Intent': 'conversation-panel',
};

// ─── Endpoint Resolution ────────────────────────────────────────────────────────

type EndpointType = 'chat' | 'responses';

// Cache: model id → supported_endpoints (refreshed on sync)
const endpointCache = new Map<string, string[]>();
let cacheLoadedAt = 0;
const CACHE_TTL = 60_000; // 1 minute

async function loadEndpointCache(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, supported_endpoints FROM upstream_models WHERE status = 'active'`,
  );
  endpointCache.clear();
  for (const r of rows) {
    endpointCache.set(r.id, r.supported_endpoints ?? []);
  }
  cacheLoadedAt = Date.now();
}

/**
 * Determine which upstream endpoint to use for a model.
 * Checks the model's supported_endpoints from DB:
 *   - If /chat/completions is listed (or no endpoints listed): use chat
 *   - If only /responses is listed: use responses
 */
async function resolveEndpoint(model: string): Promise<EndpointType> {
  if (Date.now() - cacheLoadedAt > CACHE_TTL) {
    await loadEndpointCache();
  }

  const endpoints = endpointCache.get(model);

  // No data or empty → default to chat (legacy models)
  if (!endpoints || endpoints.length === 0) return 'chat';

  // Prefer /chat/completions if available
  if (endpoints.includes('/chat/completions')) return 'chat';

  // Use /responses if available
  if (endpoints.includes('/responses')) return 'responses';

  // Fallback to chat
  return 'chat';
}

// ─── Chat Completions API (/chat/completions) ───────────────────────────────────

async function chatCompletionViaChat(
  token: string,
  request: ChatRequest,
): Promise<string> {
  const body = JSON.stringify({
    messages: request.messages,
    model: request.model ?? 'gpt-4o',
    stream: false,
    temperature: 0.1,
    top_p: 1,
    n: 1,
  });

  const res = await fetch(`${COPILOT_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...COPILOT_HEADERS },
    body,
  });

  if (res.ok) {
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }

  const errText = await res.text();
  if (res.status === 401) invalidateTokenCache();
  throw new Error(`Chat completions ${res.status} for model=${request.model}: ${errText.slice(0, 300)}`);
}

async function chatStreamViaChat(
  token: string,
  request: ChatRequest,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${COPILOT_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...COPILOT_HEADERS },
    body: JSON.stringify({
      messages: request.messages,
      model: request.model ?? 'gpt-4o',
      stream: true,
      temperature: 0.1,
      top_p: 1,
      n: 1,
    }),
  });

  if (res.status === 401) {
    invalidateTokenCache();
    throw new Error('Copilot token expired — retry');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat completions stream ${res.status}: ${body.slice(0, 300)}`);
  }

  if (!res.body) throw new Error('No response body from Copilot API');
  return res.body as ReadableStream<Uint8Array>;
}

// ─── Responses API (/responses) ─────────────────────────────────────────────────

/**
 * Convert chat-completions-style messages to /responses input format.
 *   system → developer role
 *   user/assistant → same roles
 */
function toResponsesInput(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((msg) => {
    const content = typeof msg.content === 'string'
      ? msg.content
      : msg.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('\n');
    return {
      role: msg.role === 'system' ? 'developer' : msg.role,
      content,
    };
  });
}

async function chatCompletionViaResponses(
  token: string,
  request: ChatRequest,
): Promise<string> {
  const res = await fetch(`${COPILOT_BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...COPILOT_HEADERS },
    body: JSON.stringify({
      model: request.model,
      input: toResponsesInput(request.messages),
      stream: false,
    }),
  });

  if (res.ok) {
    const data = (await res.json()) as {
      output: Array<{
        content?: Array<{ text?: string; type?: string }>;
        type: string;
      }>;
    };
    // Extract text from the message output item
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text' && part.text) {
            return part.text;
          }
        }
      }
    }
    return '';
  }

  const errText = await res.text();
  if (res.status === 401) invalidateTokenCache();
  throw new Error(`Responses API ${res.status} for model=${request.model}: ${errText.slice(0, 300)}`);
}

/**
 * Stream from /responses and translate to chat-completions-style SSE.
 *
 * Upstream /responses SSE events:
 *   event: response.output_text.delta  → data: { delta: "..." }
 *   event: response.completed          → end of stream
 *
 * We translate to standard OpenAI chat completions SSE:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
async function chatStreamViaResponses(
  token: string,
  request: ChatRequest,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${COPILOT_BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...COPILOT_HEADERS },
    body: JSON.stringify({
      model: request.model,
      input: toResponsesInput(request.messages),
      stream: true,
    }),
  });

  if (res.status === 401) {
    invalidateTokenCache();
    throw new Error('Copilot token expired — retry');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Responses API stream ${res.status}: ${body.slice(0, 300)}`);
  }

  if (!res.body) throw new Error('No response body from Copilot API');

  // Transform /responses SSE → /chat/completions SSE format
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstream = res.body as ReadableStream<Uint8Array>;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!; // keep incomplete last line

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent === 'response.output_text.delta') {
              try {
                const parsed = JSON.parse(line.slice(6)) as { delta?: string };
                if (parsed.delta) {
                  // Emit as chat-completions-style SSE
                  const chunk = JSON.stringify({
                    choices: [{ delta: { content: parsed.delta }, index: 0 }],
                  });
                  controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                }
              } catch { /* skip unparseable */ }
            } else if (line.startsWith('data: ') && currentEvent === 'response.completed') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            }
          }
        }

        // Flush any remaining buffer
        if (buffer.trim()) {
          // Handle edge case of final line
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Send a chat completion request, automatically routing to the correct
 * upstream endpoint based on the model's supported_endpoints.
 */
export async function chatCompletion(request: ChatRequest): Promise<string> {
  const model = request.model ?? 'gpt-4o';
  const token = await getCopilotToken();
  const endpoint = await resolveEndpoint(model);

  console.log(`[copilot-client] ${model} → ${endpoint === 'responses' ? '/responses' : '/chat/completions'}`);

  if (endpoint === 'responses') {
    return chatCompletionViaResponses(token, request);
  }
  return chatCompletionViaChat(token, request);
}

/**
 * Send a streaming chat completion, automatically routing to the correct
 * upstream endpoint. Returns a ReadableStream of SSE chunks in
 * chat-completions format regardless of upstream endpoint.
 */
export async function chatCompletionStream(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const model = request.model ?? 'gpt-4o';
  const token = await getCopilotToken();
  const endpoint = await resolveEndpoint(model);

  console.log(`[copilot-client] stream ${model} → ${endpoint === 'responses' ? '/responses' : '/chat/completions'}`);

  if (endpoint === 'responses') {
    return chatStreamViaResponses(token, request);
  }
  return chatStreamViaChat(token, request);
}
