/**
 * Standalone worker process: `npm run dev:worker`.
 * Run as many copies as you like (on one machine or many) - rate limits and claims are
 * enforced in Redis/Postgres, not in memory, so they stay correct across all of them.
 */
import { migrate } from './db/migrate';
import { pool } from './db/pool';
import { emailQueue } from './queue/emailQueue';
import { createEmailWorker } from './queue/emailWorker';
import { redis } from './redis';
import { closeTransporters } from './services/mailer';
import { reconcileQueue } from './services/scheduler';
import { initSearch } from './services/search';
import { logger } from './utils/logger';

async function main() {
  await migrate();
  await initSearch();
  await reconcileQueue();
  const worker = createEmailWorker();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, letting in-flight jobs finish...`);
    await worker.close(); // waits for active jobs; delayed jobs stay safely in Redis
    await emailQueue.close();
    closeTransporters();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Worker failed to start', err);
  process.exit(1);
});
