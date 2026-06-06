import { getCopilotToken, invalidateTokenCache } from './copilot-token.js';
import { pool } from '../db/client.js';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
}

export interface RawChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  parallel_tool_calls?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  user?: string;
}

export interface UpstreamChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
      reasoning_text?: string;
      reasoning_opaque?: string;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Normalise non-streaming chat completions so they always conform to the
 * OpenAI shape `choices[0].message.tool_calls = [...]`.
 *
 * Some Copilot models (notably Anthropic Claude family) leak Anthropic's
 * native multi-content-block shape through `/chat/completions` as multiple
 * top-level `choices` — one per text block, one per tool call — each
 * without an `index` field. Collapse those into a single OpenAI-style
 * choice with all tool calls in one `message.tool_calls` array.
 *
 * Standard OpenAI responses (and `n > 1` requests) are passed through
 * unchanged because their choices carry distinct `index` values.
 */
export function normalizeChatCompletion(c: UpstreamChatCompletion): UpstreamChatCompletion {
  if (!c.choices || c.choices.length <= 1) return c;

  const allMissingIndex = c.choices.every(
    (ch) => ch.index === undefined || ch.index === null || ch.index === 0,
  );
  const distinctIndices = new Set(c.choices.map((ch) => ch.index)).size;
  // If indices are distinct (true n>1 completions), do nothing.
  if (!allMissingIndex && distinctIndices === c.choices.length) return c;

  const merged: UpstreamChatCompletion['choices'][number] = {
    index: 0,
    finish_reason: 'stop',
    message: { role: 'assistant', content: null },
  };

  const textParts: string[] = [];
  const reasoningParts: string[] = [];
  const reasoningOpaqueParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  let lastFinishReason: string | undefined;

  for (const ch of c.choices) {
    const m = ch.message;
    if (typeof m?.content === 'string' && m.content.length > 0) textParts.push(m.content);
    if (m?.reasoning_text) reasoningParts.push(m.reasoning_text);
    if (m?.reasoning_opaque) reasoningOpaqueParts.push(m.reasoning_opaque);
    if (Array.isArray(m?.tool_calls)) toolCalls.push(...m.tool_calls);
    if (ch.finish_reason) lastFinishReason = ch.finish_reason;
  }

  merged.message.content = textParts.length > 0 ? textParts.join('') : null;
  if (toolCalls.length > 0) merged.message.tool_calls = toolCalls;
  if (reasoningParts.length > 0) merged.message.reasoning_text = reasoningParts.join('\n');
  if (reasoningOpaqueParts.length > 0) merged.message.reasoning_opaque = reasoningOpaqueParts.join('');
  // Prefer 'tool_calls' if any tool call is present; otherwise use the last seen.
  merged.finish_reason = toolCalls.length > 0 ? 'tool_calls' : lastFinishReason ?? 'stop';

  return { ...c, choices: [merged] };
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
    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
    }
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

// ─── Raw passthrough (tool calling / OpenAI-compatible) ─────────────────────────

/**
 * Resolve the upstream endpoint for a model without routing — exposed so
 * callers can pre-validate that a model supports `/chat/completions` before
 * issuing a tool-calling request.
 */
async function getModelEndpoint(model: string): Promise<EndpointType> {
  return resolveEndpoint(model);
}

function buildRawBody(request: RawChatRequest, stream: boolean): string {
  const payload: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    stream,
  };
  if (request.tools !== undefined) payload.tools = request.tools;
  if (request.tool_choice !== undefined) payload.tool_choice = request.tool_choice;
  if (request.parallel_tool_calls !== undefined) payload.parallel_tool_calls = request.parallel_tool_calls;
  if (request.temperature !== undefined) payload.temperature = request.temperature;
  if (request.top_p !== undefined) payload.top_p = request.top_p;
  if (request.max_tokens !== undefined) payload.max_tokens = request.max_tokens;
  if (request.user !== undefined) payload.user = request.user;
  return JSON.stringify(payload);
}

/**
 * Stateless, OpenAI-compatible chat completion. Surfaces the full upstream
 * response (including `tool_calls` and `usage`). Only supports models whose
 * `supported_endpoints` includes `/chat/completions`.
 */
export async function chatCompletionRaw(request: RawChatRequest): Promise<UpstreamChatCompletion> {
  const token = await getCopilotToken();
  const res = await fetch(`${COPILOT_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...COPILOT_HEADERS },
    body: buildRawBody(request, false),
  });

  if (res.ok) {
    return (await res.json()) as UpstreamChatCompletion;
  }

  const errText = await res.text();
  if (res.status === 401) invalidateTokenCache();
  const err = new Error(`Chat completions ${res.status} for model=${request.model}: ${errText.slice(0, 300)}`) as Error & { status?: number };
  err.status = res.status;
  throw err;
}

/**
 * Stateless streaming chat completion — returns the raw upstream SSE stream
 * (OpenAI-shaped `data: {...}` chunks terminated by `data: [DONE]`).
 */
export async function chatCompletionStreamRaw(request: RawChatRequest): Promise<ReadableStream<Uint8Array>> {
  const token = await getCopilotToken();
  const res = await fetch(`${COPILOT_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...COPILOT_HEADERS },
    body: buildRawBody(request, true),
  });

  if (res.status === 401) {
    invalidateTokenCache();
    throw new Error('Copilot token expired — retry');
  }

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Chat completions stream ${res.status}: ${body.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (!res.body) throw new Error('No response body from Copilot API');
  return res.body as ReadableStream<Uint8Array>;
}
