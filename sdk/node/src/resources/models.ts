import { APIResource } from "./health.js";
import type { RequestOptions } from "../client.js";

export interface ModelInfo {
  id: string;
  [key: string]: unknown;
}

export type ModelsListResponse =
  | ModelInfo[]
  | { data: ModelInfo[] }
  | { models: ModelInfo[] };

export class Models extends APIResource {
  /**
   * GET /api/models
   *
   * Returns the list of models the calling API key is authorized to use.
   * Normalizes the various server response shapes into a flat array of
   * `ModelInfo` objects.
   */
  async list(options?: RequestOptions): Promise<ModelInfo[]> {
    const raw = await this._client.get<ModelsListResponse>("/api/models", options);
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
