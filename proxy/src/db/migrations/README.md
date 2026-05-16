# Database migrations

Migrations are plain `.sql` files in this directory, run in **lexicographic
order** of their filename. Naming convention:

```
NNNN_short_snake_case_name.sql
```

…where `NNNN` is a zero-padded sequence number that strictly increases.

## Rules

1. **Never edit a migration that has already been applied** in any
   environment (dev, staging, prod). Always add a new file.
2. **Always additive when possible**: `ADD COLUMN`, `CREATE TABLE`,
   `CREATE INDEX CONCURRENTLY` (where supported). Avoid destructive
   changes; if you must drop something, write a separate explicit
   migration and warn the user.
3. **Idempotency is nice-to-have but not required** — the runner ensures
   each migration runs exactly once. Use `IF NOT EXISTS` only when it
   reads more clearly than asserting state.
4. **Each migration runs inside a single transaction**. Don't use
   statements that PostgreSQL forbids inside a transaction (e.g.
   `CREATE INDEX CONCURRENTLY`, `VACUUM`). If you need them, split into
   two migrations and isolate the non-transactional one.
5. **No `BEGIN` / `COMMIT`** inside a migration file — the runner wraps
   it for you.

## How it runs

- `proxy/scripts/migrate.mjs` is the runner. It:
  1. Ensures the `schema_migrations` bookkeeping table exists.
  2. Lists every `*.sql` file in this directory, sorted by name.
  3. For each file not in `schema_migrations`, runs it in a transaction,
     then records `(name, checksum, applied_at)`.
  4. Aborts on first failure.

- `upgradeWingman.sh` calls the runner as step 5 of every upgrade.
- `docker-entrypoint-initdb.d/01-schema.sql` (the existing
  `proxy/src/db/schema.sql`) still bootstraps brand-new databases on
  first container start. The migration runner then records its current
  state and applies anything new on top.

## Verifying

```bash
docker compose exec -T proxy node scripts/migrate.mjs --dry-run
```

`--dry-run` prints which files would run without applying them.
