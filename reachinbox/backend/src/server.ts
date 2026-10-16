import { Worker } from 'bullmq';
import { createApp } from './app';
import { config } from './config';
import { migrate } from './db/migrate';
import { pool } from './db/pool';
import { emailQueue } from './queue/emailQueue';
import { createEmailWorker } from './queue/emailWorker';
import { redis } from './redis';
import { closeTransporters, ensureSenders } from './services/mailer';
import { reconcileQueue } from './services/scheduler';
import { initSearch } from './services/search';
import { logger } from './utils/logger';

async function main() {
  await migrate();
  const senders = await ensureSenders();
  logger.info(`Senders: ${senders.map((s) => `#${s.id} ${s.smtp_user}`).join(', ')}`);
  await initSearch();

  let worker: Worker | null = null;
  if (config.runWorkerInApi) {
    await reconcileQueue();
    worker = createEmailWorker();
  }

  const server = createApp().listen(config.port, () => {
    logger.info(`API listening on ${config.backendUrl}  |  queue dashboard: ${config.backendUrl}/admin/queues`);
  });

  // Graceful shutdown: stop taking HTTP requests, let in-flight jobs finish, then close connections.
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    server.close();
    if (worker) await worker.close();
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
  logger.error('Failed to start API', err);
  process.exit(1);
});
