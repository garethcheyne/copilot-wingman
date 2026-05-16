#!/usr/bin/env node
/**
 * Reset users — removes all users and sessions, re-triggering the setup flow.
 * Usage: node scripts/reset-users.mjs
 */
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://wingman:password@localhost:5440/wingman';

const pool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  await pool.query('DELETE FROM user_sessions');
  await pool.query('DELETE FROM users');
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  console.log(`✓ All users and sessions removed (${rows[0].count} users remaining)`);
  console.log('  Next visit will trigger the setup flow.');
} catch (err) {
  console.error('✗ Failed to reset users:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
