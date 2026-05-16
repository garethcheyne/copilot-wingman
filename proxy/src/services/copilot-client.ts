import { getCopilotToken, invalidateTokenCache } from './copilot-token.js';

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

const COPILOT_API = 'https://api.githubcopilot.com/chat/completions';
const GITHUB_MODELS_API = 'https://models.inference.ai.azure.com/chat/completions';

/**
 * Send a chat completion request to Copilot (non-streaming).
 * Falls back to GitHub Models API if Copilot internal API fails.
 */
export async function chatCompletion(request: ChatRequest): Promise<string> {
  const token = await getCopilotToken();
  const body = JSON.stringify({
    messages: request.messages,
    model: request.model ?? 'gpt-4o',
    stream: false,
    temperature: 0.1,
    top_p: 1,
    n: 1,
  });

  // Try Copilot internal API first
  const res = await fetch(COPILOT_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GithubCopilot/1.300.0',
      'Copilot-Integration-Id': 'vscode-chat',
      'Editor-Version': 'vscode/1.100.0',
      'Editor-Plugin-Version': 'copilot-chat/0.28.0',
      'Openai-Intent': 'conversation-panel',
    },
    body,
  });

  if (res.ok) {
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }

  if (res.status === 401) {
    invalidateTokenCache();
  }

  // Fallback: try GitHub Models API with PAT as bearer
  const modelsRes = await fetch(GITHUB_MODELS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (modelsRes.ok) {
    const data = (await modelsRes.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }

  const errBody = await modelsRes.text();
  throw new Error(`Copilot API error (${modelsRes.status}): ${errBody}`);
}

/**
 * Send a streaming chat completion to Copilot, returns a ReadableStream of SSE chunks.
 */
export async function chatCompletionStream(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const token = await getCopilotToken();

  const res = await fetch(COPILOT_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GithubCopilot/1.300.0',
      'Copilot-Integration-Id': 'vscode-chat',
      'Editor-Version': 'vscode/1.100.0',
      'Editor-Plugin-Version': 'copilot-chat/0.28.0',
      'Openai-Intent': 'conversation-panel',
    },
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
    throw new Error(`Copilot API error (${res.status}): ${body}`);
  }

  if (!res.body) {
    throw new Error('No response body from Copilot API');
  }

  return res.body as ReadableStream<Uint8Array>;
}
