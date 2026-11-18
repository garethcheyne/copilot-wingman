import { createHash } from 'node:crypto';

/**
 * SHA-256 of ENCRYPTION_KEY values known to be compromised (committed to the
 * repo at some point). Stored as hashes so the keys themselves aren't repeated.
 */
const COMPROMISED_KEY_HASHES = new Set([
  '492c36a6641668ad3e0b8a224c61a45834c88dc6d9d2e93c806138d0a1a37924', // ci.yml, commit c97089f
]);

/** Exit on a missing/weak ENCRYPTION_KEY; warn loudly on a known-leaked one. */
export function checkEncryptionKey(): void {
  const key = process.env.ENCRYPTION_KEY ?? '';
  if (key.length < 32) {
    console.error('[startup] ENCRYPTION_KEY is missing or shorter than 32 characters. Generate one with: openssl rand -hex 32');
    process.exit(1);
  }
  const hash = createHash('sha256').update(key).digest('hex');
  if (COMPROMISED_KEY_HASHES.has(hash)) {
    console.error(
      '[startup] ⚠ SECURITY: ENCRYPTION_KEY is a known-leaked value (it was committed to the repo). ' +
      'Rotate it: see scripts/rotate-encryption-key.mjs',
    );
  }
}
