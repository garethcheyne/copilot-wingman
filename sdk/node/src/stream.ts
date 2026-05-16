/**
 * SSE stream reader. Parses Server-Sent Events from a Response body into an
 * async iterable of parsed JSON chunks.
 *
 * The Wingman proxy streams OpenAI-style chunks via SSE: each event is a
 * single `data:` line whose payload is either a JSON object
 * (`{"choices":[{"delta":{"content":"hi"}}],...}`) or the literal `[DONE]`
 * sentinel terminating the stream.
 */

import { APIError, WingmanError } from "./errors.js";

export interface ChatStreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    delta?: { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
  [key: string]: unknown;
}

export class Stream<Item> implements AsyncIterable<Item> {
  readonly controller: AbortController;
  #iteratorFactory: () => AsyncIterator<Item>;
  #consumed = false;

  constructor(iteratorFactory: () => AsyncIterator<Item>, controller: AbortController) {
    this.#iteratorFactory = iteratorFactory;
    this.controller = controller;
  }

  static fromSSEResponse<Item = ChatStreamChunk>(
    response: Response,
    controller: AbortController
  ): Stream<Item> {
    if (!response.body) {
      throw new WingmanError("Streaming response has no body");
    }

    let consumed = false;
    const body = response.body;

    async function* iterator(): AsyncIterator<Item> {
      if (consumed) {
        throw new WingmanError(
          "Cannot iterate over a consumed stream; create a new request instead."
        );
      }
      consumed = true;

      const reader = body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line ("\n\n").
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            let eventName: string | null = null;
            const dataLines: string[] = [];
            for (const rawLine of frame.split("\n")) {
              const line = rawLine.replace(/\r$/, "");
              if (!line || line.startsWith(":")) continue;
              const colon = line.indexOf(":");
              const field = colon === -1 ? line : line.slice(0, colon);
              const value =
                colon === -1
                  ? ""
                  : line.slice(colon + 1).replace(/^ /, "");
              if (field === "event") eventName = value;
              else if (field === "data") dataLines.push(value);
            }

            if (dataLines.length === 0) continue;
            const data = dataLines.join("\n");
            if (data === "[DONE]") return;

            if (eventName === "error") {
              let parsed: unknown;
              try {
                parsed = JSON.parse(data);
              } catch {
                parsed = data;
              }
              throw APIError.generate(
                undefined,
                typeof parsed === "object" ? (parsed as Record<string, unknown>) : data,
                "Stream error",
                response.headers
              );
            }

            try {
              yield JSON.parse(data) as Item;
            } catch {
              // Non-JSON chunk (rare). Surface as a raw string.
              yield data as unknown as Item;
            }
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
      }
    }

    return new Stream<Item>(iterator, controller);
  }

  [Symbol.asyncIterator](): AsyncIterator<Item> {
    if (this.#consumed) {
      throw new WingmanError(
        "Stream already consumed; issue a new request to stream again."
      );
    }
    this.#consumed = true;
    return this.#iteratorFactory();
  }

  /** Abort the underlying fetch and stop iteration. */
  abort(): void {
    this.controller.abort();
  }
}
