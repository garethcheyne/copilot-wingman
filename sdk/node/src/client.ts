/**
 * Wingman client — request engine + resource composition.
 *
 * Architecture mirrors (re-implements, doesn't copy) the Anthropic TypeScript
 * SDK request pipeline:
 *   methodRequest → request → makeRequest → buildRequest → fetch → parse → retry
 */

import { VERSION } from "./version.js";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  type APIErrorBody,
} from "./errors.js";
import { Stream } from "./stream.js";
import { Health } from "./resources/health.js";
import { Models } from "./resources/models.js";
import { Chat } from "./resources/chat.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

export type FetchLike = typeof fetch;

export interface WingmanClientOptions {
  /** Wingman API key (`wm_...`). Falls back to `process.env.WINGMAN_API_KEY`. */
  apiKey?: string;
  /**
   * Base URL of the Wingman proxy (required).
   * Pass explicitly, e.g. `new Wingman({ apiKey, baseURL: 'https://your-host' })`,
   * or set `WINGMAN_BASE_URL` in the environment.
   */
  baseURL?: string;
  /** Per-request timeout in ms (default 60000). */
  timeout?: number;
  /** Number of retries on transient errors (default 2). */
  maxRetries?: number;
  /** Custom fetch implementation (defaults to global `fetch`). */
  fetch?: FetchLike;
  /** Extra headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /** Logger; defaults to a no-op. Set to `console` to see debug info. */
  logger?: Pick<Console, "debug" | "info" | "warn" | "error">;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  signal?: AbortSignal;
  maxRetries?: number;
  /** Internal — set true to ask the engine to return the raw Response for SSE. */
  stream?: boolean;
}

interface InternalRequestArgs {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  options?: RequestOptions;
}

type Logger = NonNullable<WingmanClientOptions["logger"]>;
const NOOP_LOGGER: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export class BaseWingman {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly defaultHeaders: Record<string, string>;
  readonly logger: Logger;
  readonly #fetch: FetchLike;

  constructor(opts: WingmanClientOptions = {}) {
    const apiKey =
      opts.apiKey ??
      (typeof process !== "undefined" ? process.env?.WINGMAN_API_KEY : undefined);
    if (!apiKey) {
      throw new Error(
        "Wingman SDK: missing apiKey. Pass `new Wingman({ apiKey: 'wm_...' })` " +
          "or set WINGMAN_API_KEY in the environment."
      );
    }
    this.apiKey = apiKey;
    const rawBaseURL =
      opts.baseURL ??
      (typeof process !== "undefined" ? process.env?.WINGMAN_BASE_URL : undefined);
    if (!rawBaseURL) {
      throw new Error(
        "Wingman SDK: missing baseURL. Pass `new Wingman({ baseURL: '...' })` " +
          "or set WINGMAN_BASE_URL in the environment."
      );
    }
    this.baseURL = rawBaseURL.replace(/\/+$/, "");
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultHeaders = { ...(opts.defaultHeaders ?? {}) };
    this.logger = opts.logger ?? NOOP_LOGGER;

    const fetchImpl = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new Error(
        "Wingman SDK: no global `fetch` found. Use Node 18+ or pass a custom fetch in options."
      );
    }
    this.#fetch = fetchImpl;
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.#request<T>({ method: "GET", path, options });
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.#request<T>({ method: "POST", path, body, options });
  }

  /** POST returning the raw Response (used for streaming endpoints). */
  async postRaw(path: string, body: unknown, options?: RequestOptions): Promise<Response> {
    return this.#requestRaw({ method: "POST", path, body, options: { ...options, stream: true } });
  }

  #buildURL(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseURL + "/");
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  #buildHeaders(options?: RequestOptions, hasBody = false): Headers {
    const h = new Headers();
    h.set("Accept", "application/json");
    h.set("Authorization", `Bearer ${this.apiKey}`);
    h.set("User-Agent", `wingman-sdk-node/${VERSION}`);
    h.set("X-Wingman-SDK", `node/${VERSION}`);
    if (hasBody) h.set("Content-Type", "application/json");
    for (const [k, v] of Object.entries(this.defaultHeaders)) h.set(k, v);
    if (options?.headers) {
      for (const [k, v] of Object.entries(options.headers)) h.set(k, v);
    }
    return h;
  }

  async #request<T>(args: InternalRequestArgs): Promise<T> {
    const response = await this.#requestRaw(args);
    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  async #requestRaw(
    args: InternalRequestArgs,
    attempt = 0
  ): Promise<Response> {
    const { method, path, body, options } = args;
    const url = this.#buildURL(path, options?.query);
    const hasBody = body !== undefined;
    const headers = this.#buildHeaders(options, hasBody);
    const maxRetries = options?.maxRetries ?? this.maxRetries;
    const timeoutMs = options?.timeout ?? this.timeout;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options?.signal;
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

    this.logger.debug?.(`[wingman] → ${method} ${url} (attempt ${attempt + 1})`);

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener("abort", onExternalAbort);

      if (externalSignal?.aborted) throw new APIUserAbortError();
      if (controller.signal.aborted) {
        if (attempt < maxRetries) {
          await this.#sleep(this.#backoff(attempt));
          return this.#requestRaw(args, attempt + 1);
        }
        throw new APIConnectionTimeoutError();
      }
      if (attempt < maxRetries) {
        await this.#sleep(this.#backoff(attempt));
        return this.#requestRaw(args, attempt + 1);
      }
      throw new APIConnectionError(`Network error: ${(err as Error).message}`, err);
    } finally {
      clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }

    if (!response.ok) {
      // Decide whether to retry.
      const retryable =
        response.status === 408 ||
        response.status === 409 ||
        response.status === 429 ||
        response.status >= 500;
      if (retryable && attempt < maxRetries) {
        const retryAfter = this.#parseRetryAfter(response.headers);
        await this.#sleep(retryAfter ?? this.#backoff(attempt));
        return this.#requestRaw(args, attempt + 1);
      }

      const bodyText = await response.text().catch(() => "");
      let parsed: APIErrorBody | string | undefined = bodyText || undefined;
      try {
        if (bodyText) parsed = JSON.parse(bodyText);
      } catch {
        /* leave as text */
      }
      throw APIError.generate(response.status, parsed, response.statusText, response.headers);
    }

    return response;
  }

  #backoff(attempt: number): number {
    // 500ms, 1s, 2s, 4s ... capped at 8s; with ±20% jitter.
    const base = Math.min(500 * 2 ** attempt, 8000);
    return base + Math.floor(Math.random() * base * 0.2);
  }

  #parseRetryAfter(headers: Headers): number | null {
    const ra = headers.get("retry-after");
    if (!ra) return null;
    const seconds = Number(ra);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
    const when = Date.parse(ra);
    if (Number.isFinite(when)) return Math.max(0, when - Date.now());
    return null;
  }

  #sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export class Wingman extends BaseWingman {
  readonly health: Health = new Health(this);
  readonly models: Models = new Models(this);
  readonly chat: Chat = new Chat(this);
}

export { Stream };
