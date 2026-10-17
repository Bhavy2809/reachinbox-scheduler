/**
 * Shared setup for integration tests: a dedicated Postgres database (reachinbox_test)
 * and Redis DB index 15, both wiped before every test. Requires Postgres + Redis running
 * (docker compose up -d postgres redis), exactly like the app itself.
 */
import { Client } from 'pg';
import { config } from '../src/config';
import { migrate } from '../src/db/migrate';
import { pool, query } from '../src/db/pool';
import { emailQueue, queueConnection } from '../src/queue/emailQueue';
import { redis } from '../src/redis';
import { ensureSenders } from '../src/services/mailer';
import { SenderRow } from '../src/types';

let dbReady: Promise<void> | null = null;

async function createTestDatabase(): Promise<void> {
  const url = new URL(config.databaseUrl);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to run tests against non-test database "${dbName}"`);
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  await migrate();
}

/** Fresh state for one test: empty tables, empty Redis DB, senders re-created. */
export async function resetState(): Promise<SenderRow[]> {
  if (!dbReady) dbReady = createTestDatabase();
  await dbReady;
  if (!config.redisUrl.endsWith('/15')) throw new Error('Tests must use Redis DB 15');
  await query('TRUNCATE emails, campaigns, slack_connections, users, senders RESTART IDENTITY CASCADE');
  await redis.flushdb();
  return ensureSenders();
}

export async function createUser(email = 'tester@example.com'): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (google_id, email, name) VALUES ($1, $2, 'Tester') RETURNING id`,
    [`g-${email}`, email],
  );
  return rows[0].id;
}

/** Close every shared connection so the test process can exit. */
export async function closeAll(): Promise<void> {
  await emailQueue.close();
  await queueConnection.quit();
  await redis.quit();
  await pool.end();
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 15_000, stepMs = 100): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
