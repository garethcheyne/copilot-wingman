import { Router } from 'express';
import type { Request, Response } from 'express';

export const openApiRouter = Router();

/**
 * GET /openapi.json
 *
 * Public OpenAPI 3.1 spec for the Wingman proxy. Covers ONLY endpoints
 * reachable with a user-issued API key (or the internal key) — admin and
 * session-auth routes are intentionally excluded so external integrators
 * see only what they can call.
 */
openApiRouter.get('/', (req: Request, res: Response): void => {
  // Use the request's own scheme+host so the spec works behind a reverse proxy.
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ??
    req.protocol;
  const host =
    (req.headers['x-forwarded-host'] as string | undefined) ?? req.get('host') ?? '';
  const serverUrl = `${proto}://${host}`;

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Wingman API',
      version: '0.1.0',
      summary: 'Public API for external integrations using a Wingman API key.',
      description: [
        'Authenticate every request with a Wingman API key (prefix `wm_`).',
        '',
        'Provide the key either as `Authorization: Bearer wm_...` or `X-Api-Key: wm_...`.',
        '',
        '**Admin endpoints are not documented here** — they require an interactive admin',
        'session and are scoped to the local web UI.',
      ].join('\n'),
      contact: { name: 'Wingman', url: 'https://github.com/garethcheyne/copilot-wingman' },
      license: { name: 'MIT' },
    },
    servers: [{ url: serverUrl, description: 'Current proxy host' }],
    tags: [
      { name: 'Chat', description: 'Chat completions (streaming or one-shot).' },
      { name: 'Models', description: 'Models reachable with the calling API key.' },
      { name: 'Health', description: 'Liveness checks. No auth required.' },
    ],
    security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
    paths: {
      '/api/chat': {
        post: {
          tags: ['Chat'],
          operationId: 'createChatMessage',
          summary: 'Send a chat message',
          description: [
            'Sends a message to Copilot in the context of a session. The proxy',
            'persists the conversation in PostgreSQL — pass the same `sessionKey`',
            'on subsequent calls to continue the thread.',
            '',
            'Set `stream: true` to receive an SSE (`text/event-stream`) response',
            'compatible with the OpenAI streaming chunk shape. Set `stream: false`',
            '(default) for a single JSON response.',
          ].join('\n'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatRequest' },
                examples: {
                  simple: {
                    summary: 'One-shot prompt',
                    value: {
                      sessionKey: 'project-alpha-user-42',
                      message: 'Explain TypeScript discriminated unions in two sentences.',
                      model: 'gpt-4o',
                    },
                  },
                  streaming: {
                    summary: 'Streaming with system prompt',
                    value: {
                      sessionKey: 'project-alpha-user-42',
                      message: 'Write a haiku about pointers.',
                      systemPrompt: 'You are a concise senior engineer.',
                      model: 'claude-sonnet-4',
                      stream: true,
                    },
                  },
                  vision: {
                    summary: 'With image attachments',
                    value: {
                      sessionKey: 'project-alpha-user-42',
                      message: 'What is in this screenshot?',
                      model: 'gpt-4o',
                      images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'],
                    },
                  },
                  pdf: {
                    summary: 'With PDF attachment (server-side rendered)',
                    value: {
                      sessionKey: 'project-alpha-user-42',
                      message: 'Summarise this document.',
                      model: 'gpt-4o',
                      images: ['data:application/pdf;base64,JVBERi0xLjcK...'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Success — JSON body for one-shot, SSE stream when `stream: true`.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ChatResponse' },
                },
                'text/event-stream': {
                  schema: { type: 'string' },
                  examples: {
                    streamed: {
                      summary: 'OpenAI-compatible delta stream',
                      value:
                        'data: {"choices":[{"delta":{"content":"Type"}}]}\n\n' +
                        'data: {"choices":[{"delta":{"content":"Script"}}]}\n\n' +
                        'data: [DONE]\n\n',
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '429': { $ref: '#/components/responses/RateLimited' },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
      '/api/models': {
        get: {
          tags: ['Models'],
          operationId: 'listModels',
          summary: 'List models available to the calling API key',
          description: [
            'Returns the models the calling API key is authorised to use. If the',
            'key has no scope restrictions, every active upstream model is returned.',
            '',
            'The `default_model` field echoes the key’s configured fallback so',
            'clients can render it in a picker.',
          ].join('\n'),
          responses: {
            '200': {
              description: 'Available models',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ModelsResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
      '/health': {
        get: {
          tags: ['Health'],
          operationId: 'getHealth',
          summary: 'Liveness + dependency check',
          description:
            'Returns 200 when both Postgres and the upstream GitHub Copilot connection are reachable; 503 otherwise. No auth required.',
          security: [],
          responses: {
            '200': {
              description: 'Healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
            '503': {
              description: 'Unhealthy — see `checks` for the failing component.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description: 'Wingman API key (prefix `wm_`).',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'wm_<48 hex>',
          description: 'Wingman API key passed as `Authorization: Bearer wm_…`.',
        },
      },
      responses: {
        BadRequest: {
          description: 'Required fields missing or malformed.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid API key.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } },
          },
        },
        Forbidden: {
          description: 'API key is valid but lacks scope for the requested model.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } },
          },
        },
        RateLimited: {
          description: 'Per-key request-per-minute limit exceeded.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } },
          },
        },
        ServerError: {
          description: 'Upstream error or unexpected failure.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } },
          },
        },
      },
      schemas: {
        ChatRequest: {
          type: 'object',
          required: ['sessionKey', 'message'],
          properties: {
            sessionKey: {
              type: 'string',
              description:
                'Stable identifier for the conversation. Reuse to continue a thread; switch to start a fresh one.',
              example: 'tenant-acme:user-42:project-alpha',
            },
            message: { type: 'string', description: 'User message content.' },
            systemPrompt: {
              type: 'string',
              description: 'Persisted on the session if it is brand new. Ignored on subsequent messages.',
            },
            model: {
              type: 'string',
              description:
                'Model id from `/api/models`. If omitted, the API key’s `default_model` is used (or 4o-mini as a final fallback).',
              example: 'gpt-4o',
            },
            stream: {
              type: 'boolean',
              default: false,
              description: 'Set true for Server-Sent Events streaming.',
            },
            images: {
              type: 'array',
              description:
                'Optional base64 data URLs attached to the user turn (vision-capable models only). ' +
                'Supports image/* data URLs directly, and `data:application/pdf;base64,...` which the ' +
                'server renders to per-page PNGs automatically (max 5 pages per PDF).',
              items: { type: 'string', format: 'data-url' },
              maxItems: 8,
            },
          },
        },
        ChatResponse: {
          type: 'object',
          required: ['sessionId', 'message'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            message: { type: 'string' },
          },
        },
        Model: {
          type: 'object',
          required: ['id', 'name', 'vendor', 'chat_enabled'],
          properties: {
            id: { type: 'string', example: 'gpt-4o' },
            name: { type: 'string', example: 'GPT-4o' },
            vendor: { type: 'string', example: 'OpenAI' },
            version: { type: 'string' },
            preview: { type: 'boolean' },
            category: { type: 'string', nullable: true },
            chat_enabled: { type: 'boolean' },
            supported_endpoints: { type: 'array', items: { type: 'string' } },
            description: { type: 'string', nullable: true },
            best_for: { type: 'string', nullable: true },
            premium_multiplier: { type: 'number', nullable: true },
            capabilities: {
              type: 'object',
              nullable: true,
              properties: {
                type: { type: 'string' },
                family: { type: 'string' },
                context_window: { type: 'integer', nullable: true },
                max_output_tokens: { type: 'integer', nullable: true },
                supports: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
        ModelsResponse: {
          type: 'object',
          properties: {
            models: { type: 'array', items: { $ref: '#/components/schemas/Model' } },
            default_model: { type: 'string', nullable: true },
            total: { type: 'integer' },
            chat_capable: { type: 'integer' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'unhealthy'] },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'string', example: 'connected' },
                github: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['connected', 'error'] },
                    username: { type: 'string', nullable: true },
                    error: { type: 'string', nullable: true },
                  },
                },
              },
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        ErrorBody: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            allowed_models: {
              type: 'array',
              items: { type: 'string' },
              description: 'Returned on 403 when the API key is out of scope for the requested model.',
            },
          },
          required: ['error'],
        },
      },
    },
  };

  res.json(spec);
});
