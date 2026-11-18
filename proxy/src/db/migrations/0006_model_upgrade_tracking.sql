-- Idempotent: schema.sql (fresh installs) already contains these objects.
-- Track requests that ask for retired upstream models (and get rerouted).

ALTER TABLE request_log
    ADD COLUMN IF NOT EXISTS requested_model VARCHAR(100),                        -- model id the caller asked for
    ADD COLUMN IF NOT EXISTS requested_model_retired BOOLEAN NOT NULL DEFAULT FALSE; -- caller asked for a retired model

CREATE INDEX IF NOT EXISTS idx_request_log_retired ON request_log (api_key_id, created_at DESC)
    WHERE requested_model_retired = true;

-- Durable per-key rollup (not purged with request_log) so admins can chase
-- integrations still sending retired model ids.
CREATE TABLE IF NOT EXISTS api_key_legacy_model_usage (
    api_key_id      UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    requested_model VARCHAR(100) NOT NULL,
    rerouted_to     VARCHAR(100),               -- last successor used; NULL = no successor (request failed)
    request_count   BIGINT NOT NULL DEFAULT 0,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (api_key_id, requested_model)
);
