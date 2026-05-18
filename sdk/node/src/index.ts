export { Wingman, BaseWingman, Stream } from "./client.js";
export type {
  WingmanClientOptions,
  RequestOptions,
  FetchLike,
} from "./client.js";
export type { ChatStreamChunk } from "./stream.js";
export type { HealthResponse } from "./resources/health.js";
export type {
  ModelInfo,
  ModelCapabilities,
  ModelsListParams,
} from "./resources/models.js";
export type {
  ChatCreateParams,
  ChatResponse,
  ChatStreamHelper,
} from "./resources/chat.js";
export type {
  ChatCompletion,
  ChatCompletionChoice,
  ChatCompletionChunk,
  ChatCompletionChunkChoiceDelta,
  ChatCompletionContentPart,
  ChatCompletionCreateParams,
  ChatCompletionMessage,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageToolCallDelta,
  ChatCompletionTool,
  ChatCompletionToolChoice,
  ChatCompletionUsage,
} from "./resources/chat-completions.js";
export {
  WingmanError,
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  ModelNotSupportedError,
  ModelNotInScopeError,
} from "./errors.js";
export { VERSION } from "./version.js";

export { Wingman as default } from "./client.js";
