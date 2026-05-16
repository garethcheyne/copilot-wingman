import { APIResource } from "./health.js";
import type { RequestOptions } from "../client.js";
import { Stream, type ChatStreamChunk } from "../stream.js";

export interface ChatCreateParams {
  /** Server-side conversation identifier; reuse to keep context across turns. */
  sessionKey: string;
  /** The new user message. */
  message: string;
  /** Optional system prompt for this turn. */
  systemPrompt?: string;
  /** Model id (e.g. `claude-sonnet-4.6`). Omit to let the server pick a default. */
  model?: string;
  /** Optional base64-encoded image data URLs. */
  images?: string[];
  /** When true, returns a `Stream` instead of a `ChatResponse`. */
  stream?: boolean;
}

export interface ChatResponse {
  /** Server-side conversation id (same as `sessionKey` you supplied). */
  sessionId: string;
  /** The assistant's reply text. */
  message: string;
  [key: string]: unknown;
}

export interface ChatStreamHelper extends AsyncIterable<string> {
  /** Underlying low-level SSE stream of chunk objects. */
  readonly raw: Stream<ChatStreamChunk>;
  /** Resolves with the fully-concatenated assistant text once the stream completes. */
  finalText(): Promise<string>;
  /** Aborts the stream. */
  abort(): void;
}

export class Chat extends APIResource {
  /**
   * POST /api/chat
   *
   * Overloaded:
   *  - `stream: false` (default) → resolves to a parsed `ChatResponse`.
   *  - `stream: true` → resolves to a `Stream<ChatStreamChunk>` async iterable.
   */
  create(params: ChatCreateParams & { stream?: false }, options?: RequestOptions): Promise<ChatResponse>;
  create(params: ChatCreateParams & { stream: true }, options?: RequestOptions): Promise<Stream<ChatStreamChunk>>;
  async create(
    params: ChatCreateParams,
    options?: RequestOptions
  ): Promise<ChatResponse | Stream<ChatStreamChunk>> {
    if (params.stream) {
      const response = await this._client.postRaw("/api/chat", params, options);
      // The underlying AbortController lives inside the engine; surface a
      // fresh one that simply aborts the response body via the network layer
      // is not exposed today. For v0.1, expose a no-op controller — callers
      // can still GC the stream to free resources.
      return Stream.fromSSEResponse<ChatStreamChunk>(response, new AbortController());
    }
    return this._client.post<ChatResponse>("/api/chat", { ...params, stream: false }, options);
  }

  /**
   * High-level streaming helper. Yields incremental text deltas; `finalText()`
   * resolves with the full assistant message once the stream completes.
   *
   * ```ts
   * const s = client.chat.stream({ sessionKey, message: 'Hi' });
   * for await (const delta of s) process.stdout.write(delta);
   * const full = await s.finalText();
   * ```
   */
  stream(
    params: Omit<ChatCreateParams, "stream">,
    options?: RequestOptions
  ): ChatStreamHelper {
    let rawStream: Stream<ChatStreamChunk> | undefined;
    let collected = "";
    let finalResolve!: (s: string) => void;
    let finalReject!: (err: unknown) => void;
    const finalPromise = new Promise<string>((resolve, reject) => {
      finalResolve = resolve;
      finalReject = reject;
    });

    const init = (async () => {
      const s = (await this.create({ ...params, stream: true }, options)) as Stream<ChatStreamChunk>;
      rawStream = s;
      return s;
    })();

    async function* iterate() {
      try {
        const s = await init;
        for await (const chunk of s) {
          const delta =
            chunk?.choices?.[0]?.delta?.content ??
            (typeof (chunk as Record<string, unknown>).content === "string"
              ? ((chunk as Record<string, unknown>).content as string)
              : "");
          if (delta) {
            collected += delta;
            yield delta;
          }
        }
        finalResolve(collected);
      } catch (err) {
        finalReject(err);
        throw err;
      }
    }

    const iterable: ChatStreamHelper = {
      [Symbol.asyncIterator]: () => iterate(),
      get raw(): Stream<ChatStreamChunk> {
        if (!rawStream) {
          throw new Error("Stream not yet initialised; iterate or await `finalText()` first.");
        }
        return rawStream;
      },
      finalText: () => finalPromise,
      abort: () => rawStream?.abort(),
    };
    return iterable;
  }
}
