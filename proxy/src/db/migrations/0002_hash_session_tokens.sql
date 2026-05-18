-- Wingman migration 0002 — hash session tokens at rest.
--
-- Before this migration, /api/auth/login and /api/auth/setup stored the raw
-- session token (the same value sent to the browser) in user_sessions.token.
-- A leaked DB snapshot was therefore enough to impersonate any logged-in
-- user.
--
-- From now on the server stores `sh1:<sha256(rawToken)>` and the raw token
-- exists only on the client. Existing rows can't be rewritten in place (we
-- don't have the originals), so we purge them — every active session is
-- invalidated and users must log in again. No user, message, or connection
-- data is touched.

DELETE FROM user_sessions;
