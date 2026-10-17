/**
 * End to end through a real BullMQ worker (SMTP_SIMULATE=true from test.env, so no network):
 * schedule -> delayed job -> worker -> rate limit / claim / "send" -> DB state.
 */
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, test } from 'node:test';
import { Worker } from 'bullmq';
import { query } from '../src/db/pool';
import { emailQueue } from '../src/queue/emailQueue';
import { createEmailWorker } from '../src/queue/emailWorker';
import { hourWindow, windowStartMs } from '../src/services/rateLimiter';
import { scheduleCampaign } from '../src/services/scheduler';
import { EmailRow } from '../src/types';
import { closeAll, createUser, resetState, waitFor } from './helpers';

async function rows(campaignId: string) {
  const { rows } = await query<EmailRow>('SELECT * FROM emails WHERE campaign_id = $1 ORDER BY id', [campaignId]);
  return rows;
}

describe('worker end to end', () => {
  let worker: Worker | null = null;
  let userId: string;

  beforeEach(async () => {
    await resetState();
    userId = await createUser();
    worker = createEmailWorker();
  });
  afterEach(async () => {
    await worker?.close();
  });
  after(closeAll);

  test('hourly limit: first N send, the rest move to the next hour - none dropped, none duplicated', async () => {
    const res = await scheduleCampaign({
      userId,
      subject: 'Load',
      body: '<p>Hi</p>',
      recipients: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'],
      startAt: new Date(),
      delayMs: 0,
      hourlyLimit: 2,
    });

    // Wait until every email is either sent or pushed into a later hour.
    const nextHour = windowStartMs(hourWindow(Date.now()) + 1);
    const final = await waitFor(async () => {
      const r = await rows(res.campaign.id);
      const settled = r.every((e) => e.status === 'sent' || (e.status === 'scheduled' && new Date(e.scheduled_at).getTime() >= nextHour));
      return settled ? r : null;
    });

    const sent = final.filter((e) => e.status === 'sent');
    const deferred = final.filter((e) => e.status === 'scheduled');
    assert.equal(sent.length, 2);
    assert.equal(deferred.length, 3);
    for (const e of sent) {
      assert.ok(e.message_id?.startsWith('simulated:'));
      assert.equal(e.attempts, 1, 'each sent email was claimed exactly once');
    }
    for (const e of deferred) assert.equal(e.rate_limited_count, 1);
    assert.equal(await emailQueue.getJobCountByTypes('failed'), 0);
  });

  test('a duplicate job for an already-sent email is a no-op', async () => {
    const res = await scheduleCampaign({
      userId,
      subject: 'Once',
      body: 'Hi',
      recipients: ['only@x.com'],
      startAt: new Date(),
      delayMs: 0,
      hourlyLimit: 10,
    });
    const [email] = await waitFor(async () => {
      const r = await rows(res.campaign.id);
      return r[0]?.status === 'sent' ? r : null;
    });

    // Enqueue the same email again under a different job id (e.g. a manual retry).
    const dup = await emailQueue.add('send-email', { emailId: email.id }, { jobId: `dup-${email.id}` });
    await waitFor(async () => ((await dup.getState()) === 'completed' ? true : null));

    const [after] = await rows(res.campaign.id);
    assert.equal(after.status, 'sent');
    assert.equal(after.attempts, 1, 'still exactly one send');
    assert.equal(after.message_id, email.message_id);
  });
});
