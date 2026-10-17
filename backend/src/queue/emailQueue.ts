import { Queue } from 'bullmq';
import { QUEUE_NAME } from '../config';
import { createRedisConnection } from '../redis';
import { EmailJobData, EmailRow } from '../types';

// BullMQ never closes a connection it was handed, so we keep a reference and close it ourselves.
export const queueConnection = createRedisConnection('queue');

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    // Retries are only for SMTP errors. Rate-limit waits do NOT use attempts (see worker).
    attempts: 1, // overridden per job below
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * One BullMQ job per email, with jobId derived from the DB id.
 * BullMQ ignores an add() whose jobId already exists, so enqueuing the same email twice
 * (double click, retried request, reconciler on restart) never creates a second job.
 */
export function jobIdFor(emailId: string): string {
  return `email-${emailId}`;
}

export async function enqueueEmails(emails: Pick<EmailRow, 'id' | 'scheduled_at'>[], maxAttempts: number) {
  const now = Date.now();
  const CHUNK = 500;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK);
    await emailQueue.addBulk(
      chunk.map((e) => ({
        name: 'send-email',
        data: { emailId: e.id },
        opts: {
          jobId: jobIdFor(e.id),
          delay: Math.max(0, new Date(e.scheduled_at).getTime() - now),
          attempts: maxAttempts,
          backoff: { type: 'exponential', delay: 5000 },
        },
      })),
    );
  }
}
