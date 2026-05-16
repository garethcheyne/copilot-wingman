// Wingman — versioned SQL migration runner.
//
// Reads every .sql file under proxy/src/db/migrations/, runs each one not
// yet recorded in schema_migrations inside its own transaction, and
// records (name, checksum, applied_at) on success.
//
// Flags:
//   --dry-run    Print which files would run, don't apply them.
//   --verbose    Print each migration's body to stdout before running.
//
// Exit codes:
//   0 — all migrations applied (or none pending)
//   1 — a migration failed (transaction rolled back)
//   2 — usage / config error (e.g. DATABASE_URL missing)
//
// Safe to re-run: already-applied migrations are skipped by name. If a
// previously-applied file's content has changed on disk, the runner prints
// a warning so you notice — but still skips it. Never edit applied
// migrations; always add a new file.

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'src', 'db', 'migrations');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const VERBOSE = args.has('--verbose');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(2);
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function listMigrations() {
  let entries;
  try {
    entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort(); // lexicographic — relies on zero-padded NNNN prefix
}

async function ensureBookkeepingTable(client) {
  // Bootstrap: if migration 0001 hasn't run yet we still need the table to
  // exist so we can check it. The migration file itself is idempotent (CREATE
  // TABLE IF NOT EXISTS) so this is safe whichever runs first.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query('SELECT name, checksum FROM schema_migrations');
  const map = new Map();
  for (const row of rows) map.set(row.name, row.checksum);
  return map;
}

async function applyMigration(client, name, body, checksum) {
  await client.query('BEGIN');
  try {
    if (VERBOSE) console.log(`\n--- ${name} ---\n${body}\n--- end ---`);
    await client.query(body);
    await client.query(
      'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
      [name, checksum]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function main() {
  const files = listMigrations();
  if (files.length === 0) {
    console.log('No migration files found in', MIGRATIONS_DIR);
    return;
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await ensureBookkeepingTable(client);
    const applied = await getApplied(client);

    const pending = [];
    for (const name of files) {
      const body = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
      const checksum = sha256(body);

      if (applied.has(name)) {
        if (applied.get(name) !== checksum) {
          console.warn(
            `⚠  ${name} has been modified since it was applied. ` +
              `Migrations must never be edited after they run — add a new file instead.`
          );
        }
        continue;
      }
      pending.push({ name, body, checksum });
    }

    if (pending.length === 0) {
      console.log(`✓ Database is up to date (${applied.size} migration(s) already applied)`);
      return;
    }

    console.log(`Pending migrations (${pending.length}):`);
    for (const m of pending) console.log(`  • ${m.name}`);

    if (DRY_RUN) {
      console.log('\n--dry-run set — not applying.');
      return;
    }

    for (const m of pending) {
      process.stdout.write(`▸ Applying ${m.name} … `);
      try {
        await applyMigration(client, m.name, m.body, m.checksum);
        console.log('ok');
      } catch (err) {
        console.log('FAILED');
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
    }

    console.log(`\n✓ Applied ${pending.length} migration(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration runner crashed:', err.message);
  process.exit(1);
});
