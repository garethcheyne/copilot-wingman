-- Wingman migration 0004 — multi-tenant labelling + tool usage on request_log.
--
-- Why: API-key callers (apps embedding Wingman) need to attribute each request
-- to a logical end-user and a logical conversation thread, so the admin panel
-- can answer "what did John do?" and "what tools have been used most?".
--
-- All columns are nullable — existing rows stay valid, callers that don't
-- supply these fields keep working exactly as before. Indexes are added so
-- the admin rollup queries stay fast.

ALTER TABLE request_log
    ADD COLUMN IF NOT EXISTS end_user         TEXT,
    ADD COLUMN IF NOT EXISTS conversation_id  TEXT,
    ADD COLUMN IF NOT EXISTS tool_calls_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tools_used       JSONB,
    ADD COLUMN IF NOT EXISTS had_tools        BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_request_log_end_user
    ON request_log(end_user) WHERE end_user IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_request_log_conversation
    ON request_log(conversation_id) WHERE conversation_id IS NOT NULL;

-- For "which tool was called most" style queries.
CREATE INDEX IF NOT EXISTS idx_request_log_had_tools
    ON request_log(had_tools) WHERE had_tools = TRUE;
