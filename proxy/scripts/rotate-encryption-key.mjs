// Wingman — rotate ENCRYPTION_KEY.
//
// Re-encrypts every secret stored with the old key under a new key, in a
// single transaction. Nothing is changed unless every value decrypts with
// OLD_ENCRYPTION_KEY and round-trips under NEW_ENCRYPTION_KEY.
//
// Encrypted data covered:
//   - gh_connections.encrypted_token   (all rows, incl. revoked/expired)
//   - app_settings.value for keys in ENCRYPTED_SETTINGS (base64)
//
// Usage (inside the proxy container, proxy stopped or not — the running
// proxy keeps working only until restarted with the new key):
//   OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... node scripts/rotate-encryption-key.mjs [--dry-run]
//
// Exit codes: 0 ok, 1 failure (rolled back), 2 usage error.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

// Keep in sync with routes/admin.ts ENCRYPTED_SETTINGS.
const ENCRYPTED_SETTINGS = ['llm_stats_api_key'];

const DRY_RUN = process.argv.includes('--dry-run');
const OLD = process.env.OLD_ENCRYPTION_KEY;
const NEW = process.env.NEW_ENCRYPTION_KEY;
const url = process.env.DATABASE_URL;

if (!url || !OLD || !NEW) {
  console.error('DATABASE_URL, OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must be set');
  process.exit(2);
}
if (OLD === NEW) {
  console.error('NEW_ENCRYPTION_KEY must differ from OLD_ENCRYPTION_KEY');
  process.exit(2);
}
if (NEW.length < 32) {
  console.error('NEW_ENCRYPTION_KEY must be at least 32 characters (e.g. `openssl rand -hex 32`)');
  process.exit(2);
}

// Same scheme as src/services/crypto.ts: sha256(key) → AES-256-GCM, [iv16][tag16][ct]
const derive = (k) => createHash('sha256').update(k).digest();
function encrypt(plain, k) {
  const iv = randomBytes(16);
  const c = createCipheriv('aes-256-gcm', derive(k), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function decrypt(buf, k) {
  const d = createDecipheriv('aes-256-gcm', derive(k), buf.subarray(0, 16));
  d.setAuthTag(buf.subarray(16, 32));
  return d.update(buf.subarray(32)) + d.final('utf8');
}
function reencrypt(buf, label) {
  let plain;
  try {
    plain = decrypt(buf, OLD);
  } catch {
    throw new Error(`${label}: does not decrypt with OLD_ENCRYPTION_KEY (wrong key, or already rotated?)`);
  }
  const out = encrypt(plain, NEW);
  if (decrypt(out, NEW) !== plain) throw new Error(`${label}: round-trip check failed`);
  return out;
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');

  const gh = await client.query('SELECT id, label, status, encrypted_token FROM gh_connections FOR UPDATE');
  for (const r of gh.rows) {
    const out = reencrypt(r.encrypted_token, `gh_connections ${r.label} (${r.status})`);
    await client.query('UPDATE gh_connections SET encrypted_token = $1 WHERE id = $2', [out, r.id]);
    console.log(`✓ gh_connections: ${r.label} (${r.status})`);
  }

  const st = await client.query('SELECT key, value FROM app_settings WHERE key = ANY($1) FOR UPDATE', [ENCRYPTED_SETTINGS]);
  for (const r of st.rows) {
    const out = reencrypt(Buffer.from(r.value, 'base64'), `app_settings ${r.key}`);
    await client.query('UPDATE app_settings SET value = $1, updated_at = NOW() WHERE key = $2', [out.toString('base64'), r.key]);
    console.log(`✓ app_settings: ${r.key}`);
  }

  if (DRY_RUN) {
    await client.query('ROLLBACK');
    console.log(`\nDry run OK — ${gh.rows.length + st.rows.length} value(s) would be re-encrypted. Nothing changed.`);
  } else {
    await client.query('COMMIT');
    console.log(`\n✓ Re-encrypted ${gh.rows.length + st.rows.length} value(s). Now set ENCRYPTION_KEY to the new key and restart the proxy.`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`✗ ${err.message}\nRolled back — nothing changed.`);
  process.exitCode = 1;
} finally {
  await client.end();
}
