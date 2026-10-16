import { DelayedError, Job, Worker } from 'bullmq';
import { config, QUEUE_NAME } from '../config';
import { createRedisConnection } from '../redis';
import {
  claimForSending,
  findEmailById,
  findEmailForSend,
  markFailed,
  markSent,
  releaseForRetry,
  reschedule,
} from '../repositories/emailRepo';
import { findSenderById } from '../repositories/senderRepo';
import { sendEmail } from '../services/mailer';
import { consumeHourly, firstHitInWindow, nextWindowRunAt, reserveSendSlot } from '../services/rateLimiter';
import { indexEmail } from '../services/search';
import { notifySlack } from '../services/slack';
import { EmailJobData } from '../types';
import { logger } from '../utils/logger';

const { minDelayBetweenSendsMs: GAP_MS, maxEmailsPerHourPerSender, sendLockTtlMs } = config.worker;

/**
 * Park the job in BullMQ's delayed set until `timestamp`, without counting it as a failed attempt.
 * Throwing DelayedError tells BullMQ "I moved this job myself, don't mark it completed or failed".
 */
async function delayUntil(job: Job<EmailJobData>, token: string | undefined, timestamp: number): Promise<never> {
  await job.moveToDelayed(Math.ceil(timestamp), token);
  throw new DelayedError();
}

export type JobOutcome = { sent: true; messageId: string } | { skipped: string };

/**
 * One job = one email. The order of checks matters:
 *  1. Is there still something to send?   (idempotency: already sent -> no-op)
 *  2. Is it due?                          (a job re-added early just waits)
 *  3. Per-sender gap                      (reserve a send slot in Redis)
 *  4. Hourly limits                       (sender + campaign, atomic in Redis)
 *  5. Claim the row in Postgres           (only one worker can ever win this)
 *  6. Send over SMTP, record the result
 */
export async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<JobOutcome> {
  const email = await findEmailForSend(job.data.emailId);
  if (!email) return { skipped: 'email row no longer exists' };
  if (email.status === 'sent' || email.status === 'failed') {
    return { skipped: `already ${email.status}` }; // a duplicate job can never send twice
  }

  const now = Date.now();

  // 2. Not due yet
  const dueAt = new Date(email.scheduled_at).getTime();
  if (dueAt > now + 1000) return delayUntil(job, token, dueAt);

  // Another worker is mid-send on this row and its lock has not expired: check back after it does.
  if (email.status === 'sending' && email.locked_at) {
    const lockExpiresAt = new Date(email.locked_at).getTime() + sendLockTtlMs;
    if (lockExpiresAt > now) return delayUntil(job, token, lockExpiresAt + 250);
  }

  // 3. Minimum gap between sends from the same sender
  if (job.data.reservedSlotAt === undefined) {
    const { slotAt, now: redisNow } = await reserveSendSlot(email.sender_id, GAP_MS);
    const wait = slotAt - redisNow; // relative, so clock differences between machines don't matter
    if (wait > 50) {
      const localSlot = Date.now() + wait;
      await job.updateData({ ...job.data, reservedSlotAt: localSlot });
      return delayUntil(job, token, localSlot);
    }
  } else if (job.data.reservedSlotAt > Date.now() + 50) {
    return delayUntil(job, token, job.data.reservedSlotAt); // woke up early
  }
  if (job.data.reservedSlotAt !== undefined) {
    await job.updateData({ emailId: job.data.emailId }); // slot used up
  }

  // 4. Hourly limits - both must have room, checked and counted atomically in Redis
  const hourly = await consumeHourly([
    { scope: `sender:${email.sender_id}`, limit: maxEmailsPerHourPerSender },
    { scope: `campaign:${email.campaign_id}`, limit: email.hourly_limit },
  ]);
  if (!hourly.allowed) {
    const { scope, limit } = hourly.blockedBy;
    const runAt = await nextWindowRunAt(scope, hourly.window, limit, GAP_MS);
    await reschedule(email.id, new Date(runAt), true); // status stays 'scheduled' - never dropped
    void indexEmail(await findEmailById(email.id));

    if (await firstHitInWindow(scope, hourly.window)) {
      const label = scope.startsWith('sender:') ? `Sender #${email.sender_id}` : `Campaign #${email.campaign_id}`;
      logger.warn(`Hourly limit hit: ${scope} (${limit}/hour). Deferring to ${new Date(runAt).toISOString()}`);
      await notifySlack(
        email.user_id,
        `:warning: *ReachInbox rate limit reached*\n${label} hit its limit of *${limit} emails/hour*.\n` +
          `Remaining emails are queued, not dropped. Next send resumes at *${new Date(runAt).toUTCString()}*.`,
      );
    }
    return delayUntil(job, token, runAt);
  }

  // 5. Claim the row. If we lose, someone else is sending/has sent it - do nothing.
  const claimed = await claimForSending(email.id, sendLockTtlMs);
  if (!claimed) return { skipped: 'claimed by another worker' };

  const sender = await findSenderById(email.sender_id);
  if (!sender) {
    await markFailed(email.id, `sender ${email.sender_id} not found`);
    return { skipped: 'sender missing' };
  }

  // 6. Send
  try {
    const result = await sendEmail(sender, {
      emailId: email.id,
      to: email.to_email,
      subject: email.subject,
      body: email.body,
    });
    const updated = await markSent(email.id, result.messageId, result.previewUrl);
    void indexEmail(updated);
    logger.info(`Sent email ${email.id} -> ${email.to_email}${result.previewUrl ? ` (${result.previewUrl})` : ''}`);
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const attemptsAllowed = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= attemptsAllowed;
    if (isLastAttempt) {
      void indexEmail(await markFailed(email.id, message));
      logger.error(`Email ${email.id} failed permanently after ${attemptsAllowed} attempt(s): ${message}`);
    } else {
      await releaseForRetry(email.id, message);
      logger.warn(`Email ${email.id} attempt ${job.attemptsMade + 1}/${attemptsAllowed} failed, will retry: ${message}`);
    }
    throw err; // let BullMQ apply the exponential backoff / mark the job failed
  }
}

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(QUEUE_NAME, processEmailJob, {
    connection: createRedisConnection('worker'),
    concurrency: config.worker.concurrency,
    // While a job runs its lock is renewed; if the process dies, the job is picked up again
    // after the lock expires ("stalled" job), and step 5 decides whether it may resend.
    lockDuration: 30000,
    maxStalledCount: 3,
  });

  worker.on('failed', (job, err) => {
    if (job) logger.warn(`Job ${job.id} failed: ${err.message}`);
  });
  worker.on('error', (err) => logger.error('Worker error', err.message));

  logger.info(
    `Worker started: concurrency=${config.worker.concurrency}, gap=${GAP_MS}ms/sender, ` +
      `limit=${maxEmailsPerHourPerSender}/hour/sender`,
  );
  return worker;
}
