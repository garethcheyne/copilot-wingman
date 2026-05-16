import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const cols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'request_log'
    ORDER BY ordinal_position;
  `);
  if (cols.rows.length === 0) {
    console.error('request_log table NOT FOUND');
    process.exitCode = 1;
  } else {
    console.log('request_log columns:');
    for (const r of cols.rows) console.log(`  ${r.column_name}: ${r.data_type}`);
  }

  const idx = await client.query(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'request_log' ORDER BY indexname;
  `);
  console.log('\nrequest_log indexes:');
  for (const r of idx.rows) console.log(`  ${r.indexname}`);

  const count = await client.query(`SELECT COUNT(*)::int AS n FROM request_log;`);
  console.log(`\nrequest_log rows: ${count.rows[0].n}`);

  const sessions = await client.query(`SELECT COUNT(*)::int AS n FROM chat_sessions;`);
  const msgs = await client.query(`SELECT COUNT(*)::int AS n FROM chat_messages;`);
  console.log(`chat_sessions rows: ${sessions.rows[0].n}`);
  console.log(`chat_messages rows: ${msgs.rows[0].n}`);
} finally {
  await client.end();
}
