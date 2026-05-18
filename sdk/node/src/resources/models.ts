import { APIResource } from "./health.js";
import type { RequestOptions } from "../client.js";

export interface ModelCapabilities {
  type?: string;
  family?: string;
  context_window?: number | null;
  max_output_tokens?: number | null;
  supports?: {
    streaming?: boolean;
    tool_calls?: boolean;
    parallel_tool_calls?: boolean;
    vision?: boolean;
    structured_outputs?: boolean;
    [key: string]: boolean | undefined;
  };
}

export interface ModelInfo {
  id: string;
  /** Flattened convenience flag — equivalent to `capabilities.supports.tool_calls === true`. */
  supports_tools?: boolean;
  capabilities?: ModelCapabilities | null;
  supported_endpoints?: string[];
  chat_enabled?: boolean;
  [key: string]: unknown;
}

export type ModelsListResponse =
  | ModelInfo[]
  | { data: ModelInfo[] }
  | { models: ModelInfo[] };

export interface ModelsListParams {
  /**
   * Capability flag(s) the model must support — server-side AND-semantics
   * when multiple flags are passed (e.g. `["tool_calls", "vision"]`).
   */
  supports?: string | string[];
  /** Only models exposing this upstream endpoint (e.g. `/chat/completions`). */
  endpoint?: string;
  /** Only chat-enabled models. */
  chatOnly?: boolean;
}

export class Models extends APIResource {
  /**
   * GET /api/models
   *
   * Returns the list of models the calling API key is authorized to use.
   * Normalizes the various server response shapes into a flat array of
   * `ModelInfo` objects.
   *
   * Optional filters narrow the result set server-side without widening
   * the API-key scope:
   *
   * ```ts
   * await client.models.list();
   * await client.models.list({ supports: "tool_calls" });
   * await client.models.list({ supports: ["tool_calls", "vision"] });
   * await client.models.list({ endpoint: "/chat/completions" });
   * ```
   */
  async list(
    params: ModelsListParams = {},
    options?: RequestOptions
  ): Promise<ModelInfo[]> {
    const query: Record<string, string | undefined> = {};
    if (params.supports !== undefined) {
      query.supports = Array.isArray(params.supports)
        ? params.supports.join(",")
        : params.supports;
    }
    if (params.endpoint !== undefined) query.endpoint = params.endpoint;
    if (params.chatOnly) query.chat_only = "true";

    const merged: RequestOptions =
      Object.keys(query).length > 0
        ? { ...options, query: { ...(options?.query ?? {}), ...query } }
        : options ?? {};

    const raw = await this._client.get<ModelsListResponse>("/api/models", merged);
    if (Array.isArray(raw)) {
      return raw.map(Models.#normalize);
    }
    if (Array.isArray((raw as { data?: ModelInfo[] }).data)) {
      return (raw as { data: ModelInfo[] }).data.map(Models.#normalize);
    }
    if (Array.isArray((raw as { models?: ModelInfo[] }).models)) {
      return (raw as { models: ModelInfo[] }).models.map(Models.#normalize);
    }
    return [];
  }

  /**
   * Shortcut for `list({ supports: "tool_calls" })`.
   */
  async listToolCapable(options?: RequestOptions): Promise<ModelInfo[]> {
    return this.list({ supports: "tool_calls" }, options);
  }

  static #normalize(item: unknown): ModelInfo {
    if (typeof item === "string") return { id: item };
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const id = (o.id ?? o.name ?? o.model) as string | undefined;
      return { ...o, id: id ?? "(unknown)" };
    }
    return { id: "(unknown)" };
  }
}
