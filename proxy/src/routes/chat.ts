import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  chatCompletion,
  chatCompletionStream,
  chatCompletionRaw,
  chatCompletionStreamRaw,
  normalizeChatCompletion,
} from '../services/copilot-client.js';
import type {
  ContentPart,
  ChatMessage,
  Tool,
  ToolChoice,
} from '../services/copilot-client.js';
import {
  getOrCreateSession,
  addMessage,
  getMessages,
} from '../services/session-manager.js';
import { buildContext } from '../services/context-builder.js';
import { countTokens, countMessageTokens } from '../services/tokenizer.js';
import { logRequest } from '../services/usage.js';
import { getModelById } from '../services/model-sync.js';

export const chatRouter = Router();

/**
 * POST /api/chat
 * Body: { sessionKey, message, systemPrompt?, model?, stream? }
 */
chatRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const startedAt = Date.now();
  let sessionId: string | null = null;
  let modelUsed: string | null = null;
  const apiKeyId: string | null = (req as any).apiKeyRecord?.id ?? null;
  const source: 'ui' | 'api_key' = apiKeyId ? 'api_key' : 'ui';

  try {
    const { sessionKey, message, systemPrompt, model, stream, images } = req.body as {
      sessionKey: string;
      message: string;
      systemPrompt?: string;
      model?: string;
      stream?: boolean;
      images?: string[]; // base64 data URLs
    };

    modelUsed = model ?? null;

    if (!sessionKey || !message) {
      res.status(400).json({ error: 'sessionKey and message are required' });
      await logRequest({
        sessionId: null,
        apiKeyId,
        source,
        model: modelUsed,
        promptTokens: null,
        completionTokens: null,
        latencyMs: Date.now() - startedAt,
        status: 'error',
        errorMessage: 'sessionKey and message are required',
      });
      return;
    }

    // Get or create session
    const session = await getOrCreateSession(sessionKey, systemPrompt, source);
    sessionId = session.id;

    // Load history
    const history = await getMessages(session.id);

    // Build context window (text only for history)
    const contextMessages = buildContext(history, session.systemPrompt, message);

    // If images are attached, convert the last user message to multi-part content
    const messages = contextMessages.map((msg, i) => {
      if (i === contextMessages.length - 1 && msg.role === 'user' && images?.length) {
        const parts: ContentPart[] = [
          { type: 'text', text: typeof msg.content === 'string' ? msg.content : '' },
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ];
        return { ...msg, content: parts };
      }
      return msg;
    });

    // Count prompt tokens (everything we're sending upstream)
    const promptTokens = countMessageTokens(messages, model);

    // Store the user message + persist its token count
    const userTokenCount = countTokens(message, model);
    await addMessage(session.id, 'user', message, userTokenCount);

    if (stream) {
      // Streaming response via SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const upstream = await chatCompletionStream({ messages, model, stream: true });
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);

          // Parse content from SSE for storage
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6)) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) fullContent += delta;
              } catch {
                // skip unparseable lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const completionTokens = fullContent ? countTokens(fullContent, model) : 0;

      // Store the complete assistant response with its token count
      if (fullContent) {
        await addMessage(session.id, 'assistant', fullContent, completionTokens);
      }

      res.write('data: [DONE]\n\n');
      res.end();

      await logRequest({
        sessionId: session.id,
        apiKeyId,
        source,
        model: modelUsed,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
        status: fullContent ? 'success' : 'error',
        errorMessage: fullContent ? null : 'Empty response from upstream',
      });
    } else {
      // Non-streaming response
      const content = await chatCompletion({ messages, model });
      const completionTokens = countTokens(content, model);

      // Store assistant response with its token count
      await addMessage(session.id, 'assistant', content, completionTokens);

      res.json({
        sessionId: session.id,
        message: content,
      });

      await logRequest({
        sessionId: session.id,
        apiKeyId,
        source,
        model: modelUsed,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
        status: 'success',
      });
    }
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error('[chat] Error:', errorMessage);

    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    }

    await logRequest({
      sessionId,
      apiKeyId,
      source,
      model: modelUsed,
      promptTokens: null,
      completionTokens: null,
      latencyMs: Date.now() - startedAt,
      status: 'error',
      errorMessage,
    });
  }
});

// ─── POST /api/chat/completions ─────────────────────────────────────────────────
//
// Stateless, OpenAI-compatible chat completions. Supports tool/function calling
// for models whose capabilities include `tool_calls`. Conversation state is the
// caller's responsibility — every request must include the full `messages[]`.

interface CompletionsBody {
  model?: string;
  messages?: ChatMessage[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  parallel_tool_calls?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  user?: string;
}

interface CompletionsError {
  code:
    | 'invalid_request'
    | 'model_does_not_support_tools'
    | 'model_endpoint_unsupported'
    | 'model_not_in_scope'
    | 'upstream_error'
    | 'upstream_timeout';
  message: string;
  param?: string;
}

function sendError(res: Response, status: number, err: CompletionsError): void {
  if (!res.headersSent) {
    res.status(status).json({ error: err });
  }
}

function genCompletionId(): string {
  // Lightweight uuid-ish id — collision risk is irrelevant for log correlation.
  const rand = () => Math.random().toString(16).slice(2, 10);
  return `wm-cmpl-${rand()}${rand()}`;
}

/**
 * Roll up an array of tool_calls (from a single assistant turn) into a
 * count + per-name breakdown, suitable for `logRequest({ toolsUsed })`.
 * Returns `null` toolsUsed when no calls were made.
 */
function summariseToolCalls(
  toolCalls: Array<{ function?: { name?: string } }> | undefined,
): { toolCallsCount: number; toolsUsed: { name: string; count: number }[] | null } {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return { toolCallsCount: 0, toolsUsed: null };
  }
  const counts = new Map<string, number>();
  for (const tc of toolCalls) {
    const name = tc?.function?.name;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const toolsUsed = Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  return { toolCallsCount: toolCalls.length, toolsUsed: toolsUsed.length > 0 ? toolsUsed : null };
}

function validateBody(body: CompletionsBody): { ok: true } | { ok: false; status: number; error: CompletionsError } {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: { code: 'invalid_request', message: 'Request body is required.' } };
  }
  if (typeof body.model !== 'string' || !body.model) {
    return { ok: false, status: 400, error: { code: 'invalid_request', message: 'model is required.', param: 'model' } };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, status: 400, error: { code: 'invalid_request', message: 'messages must be a non-empty array.', param: 'messages' } };
  }

  // Validate tool messages: tool_call_id required + must reference a preceding assistant tool_call.
  const seenToolCallIds = new Set<string>();
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i];
    if (!m || typeof m !== 'object') {
      return { ok: false, status: 400, error: { code: 'invalid_request', message: `messages[${i}] is invalid.`, param: `messages[${i}]` } };
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id) seenToolCallIds.add(tc.id);
      }
    }
    if (m.role === 'tool') {
      if (!m.tool_call_id) {
        return { ok: false, status: 400, error: { code: 'invalid_request', message: `messages[${i}].tool_call_id is required for role:"tool".`, param: `messages[${i}].tool_call_id` } };
      }
      if (!seenToolCallIds.has(m.tool_call_id)) {
        return { ok: false, status: 400, error: { code: 'invalid_request', message: `messages[${i}].tool_call_id does not reference a preceding assistant tool_call.`, param: `messages[${i}].tool_call_id` } };
      }
    }
  }

  if (body.tool_choice === 'required' && (!Array.isArray(body.tools) || body.tools.length === 0)) {
    return { ok: false, status: 400, error: { code: 'invalid_request', message: 'tool_choice="required" requires a non-empty tools[].', param: 'tool_choice' } };
  }

  return { ok: true };
}

chatRouter.post('/completions', async (req: Request, res: Response): Promise<void> => {
  const startedAt = Date.now();
  const apiKeyId: string | null = (req as any).apiKeyRecord?.id ?? null;
  const source: 'ui' | 'api_key' = apiKeyId ? 'api_key' : 'ui';
  const body = (req.body ?? {}) as CompletionsBody;
  const modelUsed = body.model ?? null;

  // Multi-tenant attribution: the calling app tells us which of *its* users
  // and which conversation this request belongs to. All optional — stateless
  // OpenAI-compatible callers can ignore these. Header > body field.
  const headerUser = req.header('x-wingman-user');
  const headerConv = req.header('x-wingman-conversation');
  const endUser =
    (typeof headerUser === 'string' && headerUser.trim()) ||
    (typeof body.user === 'string' && body.user.trim()) ||
    null;
  const conversationId =
    (typeof headerConv === 'string' && headerConv.trim()) ||
    (typeof (body as any).wingman_conversation === 'string' && ((body as any).wingman_conversation as string).trim()) ||
    null;
  const hadTools = Array.isArray(body.tools) && body.tools.length > 0;

  const logErr = (status: 'error', message: string, promptTokens: number | null = null) =>
    logRequest({
      sessionId: null,
      apiKeyId,
      source,
      model: modelUsed,
      promptTokens,
      completionTokens: null,
      latencyMs: Date.now() - startedAt,
      status,
      errorMessage: message,
      endUser,
      conversationId,
      hadTools,
    });

  try {
    // 1. Shape validation
    const v = validateBody(body);
    if (!v.ok) {
      sendError(res, v.status, v.error);
      await logErr('error', v.error.message);
      return;
    }

    const model = body.model as string;
    const messages = body.messages as ChatMessage[];
    const tools = body.tools;

    // 2. Capability validation (only when tools[] supplied)
    if (Array.isArray(tools) && tools.length > 0) {
      const stored = await getModelById(model);
      const supportsTools = stored?.capabilities?.supports?.tool_calls === true;
      if (!supportsTools) {
        const err: CompletionsError = {
          code: 'model_does_not_support_tools',
          message: `Model '${model}' does not support tool calling.`,
          param: 'tools',
        };
        sendError(res, 400, err);
        await logErr('error', err.message);
        return;
      }

      const endpoints = stored?.supported_endpoints ?? [];
      if (endpoints.length > 0 && !endpoints.includes('/chat/completions')) {
        const err: CompletionsError = {
          code: 'model_endpoint_unsupported',
          message: `Model '${model}' is not available on /chat/completions — tool calling is not supported on /responses-only models in this version.`,
        };
        sendError(res, 400, err);
        await logErr('error', err.message);
        return;
      }
    }

    // 3. Token accounting (best-effort, never blocks the request)
    let promptTokens: number | null = null;
    try {
      promptTokens = countMessageTokens(messages, model, tools);
    } catch {
      promptTokens = null;
    }

    const rawReq = {
      model,
      messages,
      tools,
      tool_choice: body.tool_choice,
      parallel_tool_calls: body.parallel_tool_calls,
      temperature: body.temperature,
      top_p: body.top_p,
      max_tokens: body.max_tokens,
      user: body.user,
    };

    if (body.stream) {
      // Streaming response — pass upstream SSE through unchanged.
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const upstream = await chatCompletionStreamRaw({ ...rawReq, stream: true });
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let assembledText = '';
      // Streaming tool-call accumulator: deltas arrive as
      // { index, id?, function: { name?, arguments? } } fragments; we only need
      // the names + total distinct indices for telemetry, not the arguments.
      const streamToolNames = new Map<number, string>();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);

          // Best-effort completion token accounting from text deltas.
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6)) as {
                  choices?: Array<{
                    delta?: {
                      content?: string;
                      tool_calls?: Array<{
                        index?: number;
                        function?: { name?: string };
                      }>;
                    };
                  }>;
                };
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) assembledText += delta.content;
                if (Array.isArray(delta?.tool_calls)) {
                  for (const tc of delta!.tool_calls) {
                    const idx = typeof tc.index === 'number' ? tc.index : streamToolNames.size;
                    const name = tc.function?.name;
                    if (name && !streamToolNames.has(idx)) {
                      streamToolNames.set(idx, name);
                    }
                  }
                }
              } catch {
                // skip unparseable
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      res.end();

      const completionTokens = assembledText ? countTokens(assembledText, model) : 0;
      const namesArr = Array.from(streamToolNames.values());
      const { toolCallsCount, toolsUsed } = summariseToolCalls(
        namesArr.map((name) => ({ function: { name } })),
      );

      await logRequest({
        sessionId: null,
        apiKeyId,
        source,
        model: modelUsed,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
        status: 'success',
        endUser,
        conversationId,
        hadTools,
        toolCallsCount,
        toolsUsed,
      });
      return;
    }

    // Non-streaming
    const upstreamRaw = await chatCompletionRaw(rawReq);
    const upstream = normalizeChatCompletion(upstreamRaw);

    // Stamp our own id for log correlation, preserve upstream usage if present.
    const out = {
      id: upstream.id ?? genCompletionId(),
      object: upstream.object ?? 'chat.completion',
      created: upstream.created ?? Math.floor(Date.now() / 1000),
      model: upstream.model ?? model,
      choices: upstream.choices,
      usage: upstream.usage,
    };

    res.json(out);

    const completionTokens =
      upstream.usage?.completion_tokens ??
      (() => {
        const txt = upstream.choices?.[0]?.message?.content ?? '';
        return txt ? countTokens(txt, model) : 0;
      })();

    const { toolCallsCount, toolsUsed } = summariseToolCalls(
      upstream.choices?.[0]?.message?.tool_calls,
    );

    await logRequest({
      sessionId: null,
      apiKeyId,
      source,
      model: modelUsed,
      promptTokens: upstream.usage?.prompt_tokens ?? promptTokens,
      completionTokens,
      latencyMs: Date.now() - startedAt,
      status: 'success',
      endUser,
      conversationId,
      hadTools,
      toolCallsCount,
      toolsUsed,
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = (err as Error & { status?: number }).status ?? 500;
    console.error('[chat/completions] Error:', message);
    if (!res.headersSent) {
      sendError(res, status >= 400 && status < 600 ? status : 500, {
        code: status === 504 ? 'upstream_timeout' : 'upstream_error',
        message,
      });
    } else {
      try { res.end(); } catch { /* ignore */ }
    }
    await logErr('error', message);
  }
});
