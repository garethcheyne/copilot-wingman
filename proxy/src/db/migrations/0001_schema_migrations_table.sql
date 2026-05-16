-- Wingman migration runner — bookkeeping table.
--
-- Lists every migration file in proxy/src/db/migrations/ that has been
-- applied to this database. Migrations are run in lexicographic order of
-- their filename (e.g. 0001_xxx.sql before 0002_yyy.sql).
--
-- Each migration runs inside a transaction; if it errors the transaction
-- is rolled back and the row is NOT inserted, so re-running the upgrade
-- will retry it from a clean state.
CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
