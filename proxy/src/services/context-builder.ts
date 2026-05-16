import type { ChatMessage } from './copilot-client.js';
import type { Message } from './session-manager.js';

const DEFAULT_TOKEN_BUDGET = 8000;

/**
 * Estimate token count for a string (rough: ~4 chars per token).
 * Use tiktoken for production accuracy.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build the context window from session history.
 * Walks backwards from newest, fitting messages within the token budget.
 */
export function buildContext(
  messages: Message[],
  systemPrompt: string | null,
  newUserMessage: string,
  tokenBudget: number = DEFAULT_TOKEN_BUDGET
): ChatMessage[] {
  const result: ChatMessage[] = [];
  let tokensUsed = 0;

  // Reserve space for system prompt
  if (systemPrompt) {
    const sysCost = estimateTokens(systemPrompt);
    tokensUsed += sysCost;
  }

  // Reserve space for the new user message
  tokensUsed += estimateTokens(newUserMessage);

  // Walk backwards through history, adding messages that fit
  const historyMessages: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const cost = msg.tokenCount ?? estimateTokens(msg.content);

    if (tokensUsed + cost > tokenBudget) {
      break;
    }

    historyMessages.unshift({ role: msg.role, content: msg.content });
    tokensUsed += cost;
  }

  // Assemble: system prompt → history → new message
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  result.push(...historyMessages);
  result.push({ role: 'user', content: newUserMessage });

  return result;
}
