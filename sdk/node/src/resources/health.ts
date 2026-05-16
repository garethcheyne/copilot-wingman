import type { BaseWingman, RequestOptions } from "../client.js";

export abstract class APIResource {
  protected _client: BaseWingman;
  constructor(client: BaseWingman) {
    this._client = client;
  }
}

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

export class Health extends APIResource {
  /** GET /api/health */
  async check(options?: RequestOptions): Promise<HealthResponse> {
    return this._client.get<HealthResponse>("/api/health", options);
  }
}
