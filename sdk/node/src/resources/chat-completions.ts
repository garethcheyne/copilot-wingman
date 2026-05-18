/**
 * `client.chat.completions` — OpenAI-compatible, stateless chat completions
 * with tool/function calling support.
 *
 * Type names mirror `openai-node` so existing OpenAI SDK code can drop in
 * with minimal changes.
 */

import { APIResource } from "./health.js";
import type { RequestOptions } from "../client.js";
import { Stream } from "../stream.js";

// ─── Message + tool types ───────────────────────────────────────────────────────

export type ChatCompletionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatCompletionMessageToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatCompletionContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatCompletionMessageToolCall[];
}

export interface ChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export type ChatCompletionToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

// ─── Request ────────────────────────────────────────────────────────────────────

export interface ChatCompletionCreateParams {
  /** Model id (must be in the caller's API key scope). */
  model: string;
  /** Conversation history including the new user turn. */
  messages: ChatCompletionMessage[];
  /** Tool/function schemas available to the model. */
  tools?: ChatCompletionTool[];
  /** Tool-selection policy. Defaults to `"auto"` server-side when omitted. */
  tool_choice?: ChatCompletionToolChoice;
  /** Disable parallel tool calls (some models only). */
  parallel_tool_calls?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  /** When true, returns a `Stream` of `ChatCompletionChunk`. */
  stream?: boolean;
  /** Pass-through end-user identifier. */
  user?: string;
}

// ─── Non-streaming response ────────────────────────────────────────────────────

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: ChatCompletionMessageToolCall[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | string;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion" | string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

// ─── Streaming chunks ──────────────────────────────────────────────────────────

export interface ChatCompletionMessageToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    /** Incremental JSON-encoded arguments fragment. Concatenate across deltas. */
    arguments?: string;
  };
}

export interface ChatCompletionChunkChoiceDelta {
  role?: "assistant";
  content?: string | null;
  tool_calls?: ChatCompletionMessageToolCallDelta[];
}

export interface ChatCompletionChunk {
  id?: string;
  object?: "chat.completion.chunk" | string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    delta?: ChatCompletionChunkChoiceDelta;
    finish_reason?: string | null;
  }>;
  usage?: ChatCompletionUsage;
}

// ─── Resource ──────────────────────────────────────────────────────────────────

export class ChatCompletions extends APIResource {
  /**
   * POST /api/chat/completions
   *
   *  - `stream: false` (default) → resolves to `ChatCompletion`.
   *  - `stream: true` → resolves to `Stream<ChatCompletionChunk>`.
   */
  create(
    params: ChatCompletionCreateParams & { stream?: false },
    options?: RequestOptions
  ): Promise<ChatCompletion>;
  create(
    params: ChatCompletionCreateParams & { stream: true },
    options?: RequestOptions
  ): Promise<Stream<ChatCompletionChunk>>;
  async create(
    params: ChatCompletionCreateParams,
    options?: RequestOptions
  ): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
    if (params.stream) {
      const response = await this._client.postRaw(
        "/api/chat/completions",
        params,
        options
      );
      return Stream.fromSSEResponse<ChatCompletionChunk>(response, new AbortController());
    }
    return this._client.post<ChatCompletion>(
      "/api/chat/completions",
      { ...params, stream: false },
      options
    );
  }
}
