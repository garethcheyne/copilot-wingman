import { encoding_for_model, get_encoding, type TiktokenModel } from 'tiktoken';
import type { ChatMessage, Tool } from './copilot-client.js';

const cl100k = get_encoding('cl100k_base');

/**
 * Best-effort token count for a single string.
 * Falls back to cl100k_base for unknown models.
 */
export function countTokens(text: string, model?: string): number {
  if (!text) return 0;

  if (model) {
    try {
      const enc = encoding_for_model(model as TiktokenModel);
      const n = enc.encode(text).length;
      enc.free();
      return n;
    } catch {
      // unknown model — fall through to cl100k
    }
  }

  return cl100k.encode(text).length;
}

/**
 * Count tokens for an array of chat messages.
 * Adds the small per-message overhead used by OpenAI-compatible APIs (~4 tokens per message + 2 for priming).
 *
 * Handles:
 *   - string content
 *   - multi-part content (text parts only — vision parts not counted here)
 *   - assistant `tool_calls` (name + JSON-encoded arguments)
 *   - `role: "tool"` messages (content + tool_call_id)
 *   - optional `tools[]` schema (JSON-encoded function definitions)
 */
export function countMessageTokens(
  messages: ChatMessage[],
  model?: string,
  tools?: Tool[],
): number {
  let total = 0;
  for (const m of messages) {
    let text = '';
    if (typeof m.content === 'string') {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
    }
    total += countTokens(text, model);

    if (m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        total += countTokens(tc.function?.name ?? '', model);
        total += countTokens(tc.function?.arguments ?? '', model);
      }
    }
    if (m.tool_call_id) {
      total += countTokens(m.tool_call_id, model);
    }
    if (m.name) {
      total += countTokens(m.name, model);
    }
    total += 4;
  }

  if (tools?.length) {
    for (const t of tools) {
      total += countTokens(JSON.stringify(t.function ?? {}), model);
    }
  }

  return total + 2;
}
