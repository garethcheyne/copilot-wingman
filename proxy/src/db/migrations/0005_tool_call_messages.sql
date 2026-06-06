-- Wingman migration 0005 — support tool-call messages in session history.
--
-- Why: When API consumers use tool-calling via /api/chat/completions with a
-- conversation_id, the individual message turns (user prompt, assistant
-- tool_calls, tool results, final assistant reply) should be persisted so
-- the session archive shows the full interaction — not just aggregate telemetry.
--
-- Changes:
--   1. Widen the role CHECK to include 'tool' (for tool-result messages).
--   2. Add `tool_calls` JSONB column for assistant messages that include tool calls.
--   3. Add `tool_call_id` TEXT column for role:'tool' messages to reference
--      which tool_call they're responding to.
--   4. Make `content` nullable — assistant messages with only tool_calls may
--      have NULL content.
--   5. Add `name` column — tool-result messages include the function name.

-- 1. Drop the old CHECK constraint and add a wider one.
--    PostgreSQL doesn't support ALTER CONSTRAINT so we drop+recreate.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check
    CHECK (role IN ('system', 'user', 'assistant', 'tool'));

-- 2. Add tool_calls JSONB for assistant turns that invoke tools.
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS tool_calls JSONB;

-- 3. Add tool_call_id for role:'tool' result messages.
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS tool_call_id TEXT;

-- 4. Allow NULL content (assistant messages with only tool_calls have no text).
ALTER TABLE chat_messages ALTER COLUMN content DROP NOT NULL;

-- 5. Add name column for tool-result messages (function name).
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS name TEXT;
