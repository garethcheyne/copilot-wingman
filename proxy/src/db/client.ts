import Pool from 'pg';

const { Pool: PgPool } = Pool;

export const pool = new PgPool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://copilot:password@localhost:5432/copilot_api',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Quick connectivity check.
 */
export async function checkDb(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
