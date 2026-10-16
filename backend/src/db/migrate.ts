import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { logger } from '../utils/logger';

const MIGRATION_LOCK_ID = 727001;

export async function migrate(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    // API and worker may boot at the same moment; an advisory lock makes them migrate one at a time.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(sql);
    logger.info('Database schema is up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

// Allow `npm run migrate`
if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('Migration failed', err);
      process.exit(1);
    });
}
