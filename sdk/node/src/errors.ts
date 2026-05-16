/**
 * Wingman SDK error hierarchy.
 *
 * Architecture follows the Anthropic SDK pattern (MIT) — re-implemented, not copied.
 */

export class WingmanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WingmanError";
  }
}

export interface APIErrorBody {
  error?: string | { message?: string; type?: string };
  message?: string;
  [key: string]: unknown;
}

export class APIError extends WingmanError {
  readonly status: number | undefined;
  readonly headers: Headers | undefined;
  readonly body: APIErrorBody | string | undefined;
  readonly requestID: string | null;

  constructor(
    status: number | undefined,
    body: APIErrorBody | string | undefined,
    message: string | undefined,
    headers: Headers | undefined
  ) {
    super(APIError.makeMessage(status, body, message));
    this.name = "APIError";
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.requestID = headers?.get("x-request-id") ?? headers?.get("request-id") ?? null;
  }

  private static makeMessage(
    status: number | undefined,
    body: APIErrorBody | string | undefined,
    message: string | undefined
  ): string {
    const bodyMsg =
      typeof body === "string"
        ? body
        : typeof body?.error === "string"
          ? body.error
          : typeof body?.error === "object" && body.error?.message
            ? body.error.message
            : typeof body?.message === "string"
              ? body.message
              : undefined;
    const finalMsg = bodyMsg ?? message ?? "API request failed";
    return status ? `${status} ${finalMsg}` : finalMsg;
  }

  /** Pick the right APIError subclass for a given HTTP status. */
  static generate(
    status: number | undefined,
    body: APIErrorBody | string | undefined,
    message: string | undefined,
    headers: Headers | undefined
  ): APIError {
    if (!status) return new APIConnectionError(message ?? "Connection failed");
    switch (status) {
      case 400:
        return new BadRequestError(status, body, message, headers);
      case 401:
        return new AuthenticationError(status, body, message, headers);
      case 403:
        return new PermissionDeniedError(status, body, message, headers);
      case 404:
        return new NotFoundError(status, body, message, headers);
      case 409:
        return new ConflictError(status, body, message, headers);
      case 422:
        return new UnprocessableEntityError(status, body, message, headers);
      case 429:
        return new RateLimitError(status, body, message, headers);
      default:
        if (status >= 500) return new InternalServerError(status, body, message, headers);
        return new APIError(status, body, message, headers);
    }
  }
}

export class APIConnectionError extends APIError {
  constructor(message = "Connection error", cause?: unknown) {
    super(undefined, undefined, message, undefined);
    this.name = "APIConnectionError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export class APIConnectionTimeoutError extends APIConnectionError {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "APIConnectionTimeoutError";
  }
}

export class APIUserAbortError extends APIError {
  constructor(message = "Request was aborted") {
    super(undefined, undefined, message, undefined);
    this.name = "APIUserAbortError";
  }
}

export class BadRequestError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "BadRequestError";
  }
}
export class AuthenticationError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "AuthenticationError";
  }
}
export class PermissionDeniedError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "PermissionDeniedError";
  }
}
export class NotFoundError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "NotFoundError";
  }
}
export class ConflictError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "ConflictError";
  }
}
export class UnprocessableEntityError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "UnprocessableEntityError";
  }
}
export class RateLimitError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "RateLimitError";
  }
}
export class InternalServerError extends APIError {
  constructor(s: number | undefined, b: APIErrorBody | string | undefined, m: string | undefined, h: Headers | undefined) {
    super(s, b, m, h);
    this.name = "InternalServerError";
  }
}
