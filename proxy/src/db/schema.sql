-- Wingman — Database Schema

-- Local users (admin accounts)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(200),
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User sessions (auth tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- GitHub connections (token storage)
CREATE TABLE IF NOT EXISTS gh_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(100) NOT NULL,
    auth_method VARCHAR(20) NOT NULL DEFAULT 'oauth'
        CHECK (auth_method IN ('oauth')),
    encrypted_token BYTEA NOT NULL,
    token_expires_at TIMESTAMPTZ,
    github_username VARCHAR(100),
    copilot_plan VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked', 'error')),
    last_validated_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key VARCHAR(200) NOT NULL UNIQUE,
    system_prompt TEXT,
    source VARCHAR(10) NOT NULL DEFAULT 'ui',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    token_count INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_time ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_key ON chat_sessions(session_key);

-- App settings (key-value)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default model
INSERT INTO app_settings (key, value) VALUES ('default_model', 'gpt-4o')
ON CONFLICT (key) DO NOTHING;

-- API keys (for external service access)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,          -- visible prefix, shown in UI
    key_hash VARCHAR(128) NOT NULL UNIQUE,   -- SHA-256 of the full key
    scopes TEXT[] NOT NULL DEFAULT '{}',      -- allowed models, e.g. '{gpt-4o,claude-sonnet-4}'
    default_model VARCHAR(100),               -- fallback model when request doesn't specify one
    rate_limit INT NOT NULL DEFAULT 30,       -- requests per minute
    expires_at TIMESTAMPTZ,                   -- null = never expires
    last_used_at TIMESTAMPTZ,
    request_count BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- Per-request telemetry — one row per /api/chat call (success or error)
CREATE TABLE IF NOT EXISTS request_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    source VARCHAR(10) NOT NULL DEFAULT 'ui',  -- 'ui' (web admin) or 'api_key' (external)
    model VARCHAR(100),
    prompt_tokens INT,
    completion_tokens INT,
    latency_ms INT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error')),
    error_message TEXT,
    -- Multi-tenant labelling supplied by the calling app.
    -- `end_user` is the app's own user identifier (e.g. "john@acme.com"),
    -- accepted via OpenAI's standard `user` body field or the X-Wingman-User header.
    -- `conversation_id` groups multiple turns into a single thread for that user,
    -- supplied via X-Wingman-Conversation. Both nullable: stateless callers
    -- that don't care about attribution can ignore them.
    end_user TEXT,
    conversation_id TEXT,
    -- Tool-call telemetry captured from the normalised upstream response.
    tool_calls_count INT NOT NULL DEFAULT 0,
    tools_used JSONB,                          -- e.g. [{"name":"get_weather","count":4}]
    had_tools BOOLEAN NOT NULL DEFAULT FALSE,  -- whether the request *offered* tools
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_log_created ON request_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_log_session ON request_log(session_id);
CREATE INDEX IF NOT EXISTS idx_request_log_model ON request_log(model);
CREATE INDEX IF NOT EXISTS idx_request_log_api_key ON request_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_request_log_end_user
    ON request_log(end_user) WHERE end_user IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_request_log_conversation
    ON request_log(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_request_log_had_tools
    ON request_log(had_tools) WHERE had_tools = TRUE;

-- Upstream models — tracks what GitHub Copilot offers us
CREATE TABLE IF NOT EXISTS upstream_models (
    id VARCHAR(100) PRIMARY KEY,              -- model id, e.g. 'claude-sonnet-4.6'
    name VARCHAR(200) NOT NULL,
    vendor VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '',
    preview BOOLEAN NOT NULL DEFAULT false,
    category VARCHAR(50),                      -- model_picker_category
    supported_endpoints TEXT[] NOT NULL DEFAULT '{}',
    chat_enabled BOOLEAN NOT NULL DEFAULT true, -- supports /chat/completions
    capabilities JSONB,                        -- full capabilities blob
    description TEXT,                          -- human-readable description
    best_for VARCHAR(200),                     -- task recommendation
    premium_multiplier NUMERIC(5,2),           -- cost multiplier (0 = included)
    retirement_date DATE,                      -- null = not scheduled for retirement
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'removed', 'revoked')),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ,                    -- when we stopped seeing it
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Model change log — records additions, removals, and capability changes
CREATE TABLE IF NOT EXISTS model_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id VARCHAR(100) NOT NULL,
    event VARCHAR(30) NOT NULL
        CHECK (event IN ('added', 'removed', 'restored', 'capabilities_changed', 'endpoints_changed')),
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_sync_log_created ON model_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_sync_log_model ON model_sync_log(model_id);

-- Notification channels
CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'webhook', 'slack')),
    config JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification log
CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES notification_channels(id),
    event VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Incremental column additions (safe to re-run) ──────────────────────────

-- v2: Model enrichment columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='description') THEN
    ALTER TABLE upstream_models ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='best_for') THEN
    ALTER TABLE upstream_models ADD COLUMN best_for VARCHAR(200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='premium_multiplier') THEN
    ALTER TABLE upstream_models ADD COLUMN premium_multiplier NUMERIC(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='retirement_date') THEN
    ALTER TABLE upstream_models ADD COLUMN retirement_date DATE;
  END IF;
END $$;

-- v3: LLM Stats enrichment columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='organization') THEN
    ALTER TABLE upstream_models ADD COLUMN organization VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='model_type') THEN
    ALTER TABLE upstream_models ADD COLUMN model_type VARCHAR(30);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='modalities') THEN
    ALTER TABLE upstream_models ADD COLUMN modalities TEXT[] NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='license') THEN
    ALTER TABLE upstream_models ADD COLUMN license VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='open_weight') THEN
    ALTER TABLE upstream_models ADD COLUMN open_weight BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='input_price_per_m') THEN
    ALTER TABLE upstream_models ADD COLUMN input_price_per_m NUMERIC(10,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='output_price_per_m') THEN
    ALTER TABLE upstream_models ADD COLUMN output_price_per_m NUMERIC(10,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='release_date') THEN
    ALTER TABLE upstream_models ADD COLUMN release_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='context_window') THEN
    ALTER TABLE upstream_models ADD COLUMN context_window INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upstream_models' AND column_name='param_count') THEN
    ALTER TABLE upstream_models ADD COLUMN param_count BIGINT;
  END IF;
END $$;
