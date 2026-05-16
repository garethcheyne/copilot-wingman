import { Router } from 'express';
import type { Request, Response } from 'express';
import { chatCompletion, chatCompletionStream } from '../services/copilot-client.js';
import type { ContentPart } from '../services/copilot-client.js';
import {
  getOrCreateSession,
  addMessage,
  getMessages,
} from '../services/session-manager.js';
import { buildContext } from '../services/context-builder.js';
import { countTokens, countMessageTokens } from '../services/tokenizer.js';
import { logRequest } from '../services/usage.js';

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
