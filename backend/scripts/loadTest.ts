/**
 * Load demo: schedule N emails for (almost) the same instant and watch the rate limiter work.
 *
 *   npm run load-test -- 1000 50
 *     -> 1000 emails, all due now, campaign hourly limit 50
 *
 * Run it while the worker is running, then open http://localhost:4000/admin/queues:
 * you'll see sends spaced by MIN_DELAY_BETWEEN_SENDS_MS, the first 50 sent, and the rest
 * moved to the delayed list for the next hour windows (nothing dropped, nothing failed).
 * Recipients are fake addresses on example.com; Ethereal accepts and captures them.
 */
import { pool } from '../src/db/pool';
import { migrate } from '../src/db/migrate';
import { emailQueue, queueConnection } from '../src/queue/emailQueue';
import { redis } from '../src/redis';
import { upsertGoogleUser } from '../src/repositories/userRepo';
import { ensureSenders } from '../src/services/mailer';
import { scheduleCampaign } from '../src/services/scheduler';
import { initSearch } from '../src/services/search';

async function main() {
  const count = Number(process.argv[2] ?? 1000);
  const hourlyLimit = Number(process.argv[3] ?? 50);
  const ownerEmail = process.argv[4]; // optional: your Google email, so the emails show on YOUR dashboard

  await migrate();
  await ensureSenders();
  await initSearch();

  const { rows } = ownerEmail
    ? await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [ownerEmail])
    : { rows: [] as { id: string }[] };
  const userId =
    rows[0]?.id ??
    (await upsertGoogleUser({ googleId: 'load-test', email: 'load-test@example.com', name: 'Load Test', avatarUrl: null })).id;

  const recipients = Array.from({ length: count }, (_, i) => `lead${i + 1}@example.com`);
  const started = Date.now();
  const res = await scheduleCampaign({
    userId,
    subject: `Load test ${new Date().toISOString()}`,
    body: 'Hello from the ReachInbox load test.',
    recipients,
    startAt: new Date(),
    delayMs: 0,
    hourlyLimit,
  });
  console.log(
    `Scheduled ${res.scheduledCount} emails (campaign ${res.campaign.id}, hourly limit ${hourlyLimit}) in ${Date.now() - started} ms`,
  );

  await emailQueue.close();
  await queueConnection.quit();
  await redis.quit();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
