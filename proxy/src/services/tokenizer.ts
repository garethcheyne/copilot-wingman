import { encoding_for_model, get_encoding, type TiktokenModel } from 'tiktoken';
import type { ChatMessage } from './copilot-client.js';

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
 */
export function countMessageTokens(messages: ChatMessage[], model?: string): number {
  let total = 0;
  for (const m of messages) {
    const text = typeof m.content === 'string'
      ? m.content
      : m.content.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('');
    total += countTokens(text, model) + 4;
  }
  return total + 2;
}
