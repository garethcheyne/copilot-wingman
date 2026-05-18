-- Wingman migration 0003 — widen user_sessions.token to fit hashed tokens.
--
-- Migration 0002 changed the stored value from a raw 64-char hex token to
-- `sh1:<sha256(rawToken)>` (68 chars), but didn't widen the column. Every
-- login attempt since then fails with:
--   ERROR: value too long for type character varying(64)
--
-- Switch to TEXT so we never have to think about this again if the hash
-- prefix or algorithm changes later.

ALTER TABLE user_sessions ALTER COLUMN token TYPE TEXT;
