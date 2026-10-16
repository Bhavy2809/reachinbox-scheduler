import { withTransaction } from '../db/pool';
import { config } from '../config';
import { emailQueue, enqueueEmails, jobIdFor } from '../queue/emailQueue';
import { findUnsentAfter } from '../repositories/emailRepo';
import { listSenders } from '../repositories/senderRepo';
import { CampaignRow, EmailRow } from '../types';
import { logger } from '../utils/logger';
import { indexEmails } from './search';

export interface ScheduleInput {
  userId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
  clientRequestId?: string;
}

export interface ScheduleResult {
  campaign: CampaignRow;
  scheduledCount: number;
  duplicatesRemoved: number;
  replayed: boolean; // true when the Idempotency-Key was seen before
}

/**
 * Write-then-enqueue:
 *  1. In ONE transaction, create the campaign and one row per recipient (status 'scheduled').
 *  2. After commit, add one delayed BullMQ job per row.
 * If the process dies between 1 and 2, the rows exist with no job - the reconciler
 * (run on every worker start) finds them and enqueues them. The DB is the source of truth.
 */
export async function scheduleCampaign(input: ScheduleInput): Promise<ScheduleResult> {
  const senders = await listSenders();
  if (senders.length === 0) throw new Error('No senders available');

  // Normalise + de-duplicate, keeping the original order of the uploaded list.
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const r of input.recipients) {
    const e = r.trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      recipients.push(e);
    }
  }

  const { campaign, emails, replayed } = await withTransaction(async (client) => {
    const ins = await client.query<CampaignRow>(
      `INSERT INTO campaigns (user_id, subject, body, start_at, delay_ms, hourly_limit, total, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, client_request_id) DO NOTHING
       RETURNING *`,
      [
        input.userId,
        input.subject,
        input.body,
        input.startAt,
        input.delayMs,
        input.hourlyLimit,
        recipients.length,
        input.clientRequestId ?? null,
      ],
    );

    if (ins.rows.length === 0) {
      // Same Idempotency-Key as an earlier request: return what that request created.
      const prev = await client.query<CampaignRow>(
        'SELECT * FROM campaigns WHERE user_id = $1 AND client_request_id = $2',
        [input.userId, input.clientRequestId],
      );
      return { campaign: prev.rows[0], emails: [] as EmailRow[], replayed: true };
    }

    const campaign = ins.rows[0];
    const start = input.startAt.getTime();
    // Email i goes out at start + i * delay, from sender i mod N (round robin).
    const senderIds = recipients.map((_, i) => senders[i % senders.length].id);
    const times = recipients.map((_, i) => new Date(start + i * input.delayMs).toISOString());

    const rows = await client.query<EmailRow>(
      `INSERT INTO emails (campaign_id, user_id, sender_id, to_email, subject, body, scheduled_at)
       SELECT $1, $2, x.sender_id, x.to_email, $3, $4, x.scheduled_at
         FROM unnest($5::int[], $6::text[], $7::timestamptz[]) AS x(sender_id, to_email, scheduled_at)
       ON CONFLICT (campaign_id, to_email) DO NOTHING
       RETURNING *`,
      [campaign.id, input.userId, input.subject, input.body, senderIds, recipients, times],
    );
    return { campaign, emails: rows.rows, replayed: false };
  });

  if (!replayed) {
    await enqueueEmails(emails, config.worker.sendMaxAttempts);
    await indexEmails(emails); // best effort
    logger.info(`Campaign ${campaign.id}: scheduled ${emails.length} emails from ${new Date(input.startAt).toISOString()}`);
  }

  return {
    campaign,
    scheduledCount: replayed ? campaign.total : emails.length,
    duplicatesRemoved: input.recipients.length - recipients.length,
    replayed,
  };
}

/**
 * Startup reconciler: every email the DB says is still unsent must have a live job.
 * Covers: crash between DB commit and enqueue, a Redis flush, or a job that was removed.
 * Re-adding is safe because jobIds are deterministic and the worker claims rows atomically.
 */
export async function reconcileQueue(): Promise<number> {
  let afterId = '0';
  let requeued = 0;
  for (;;) {
    const batch = await findUnsentAfter(afterId, 500);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1].id;

    const missing: EmailRow[] = [];
    for (const email of batch) {
      const job = await emailQueue.getJob(jobIdFor(email.id));
      if (!job) {
        missing.push(email);
        continue;
      }
      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        // Job finished but the row is still unsent - replace the stale job.
        await job.remove();
        missing.push(email);
      }
    }
    if (missing.length > 0) {
      await enqueueEmails(missing, config.worker.sendMaxAttempts);
      requeued += missing.length;
    }
  }
  if (requeued > 0) logger.warn(`Reconciler re-queued ${requeued} emails that had no live job`);
  else logger.info('Reconciler: every unsent email has a live job');
  return requeued;
}
