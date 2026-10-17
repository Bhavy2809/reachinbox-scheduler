import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { query } from '../src/db/pool';
import { emailQueue, jobIdFor } from '../src/queue/emailQueue';
import { reconcileQueue, scheduleCampaign } from '../src/services/scheduler';
import { EmailRow } from '../src/types';
import { closeAll, createUser, resetState } from './helpers';

async function emailsOf(campaignId: string) {
  const { rows } = await query<EmailRow>('SELECT * FROM emails WHERE campaign_id = $1 ORDER BY id', [campaignId]);
  return rows;
}

describe('scheduling', () => {
  let userId: string;
  beforeEach(async () => {
    await resetState();
    userId = await createUser();
  });
  after(closeAll);

  test('one row + one delayed job per unique recipient, spaced by the delay, round-robin senders', async () => {
    const start = new Date(Date.now() + 10 * 60_000);
    const res = await scheduleCampaign({
      userId,
      subject: 'Hi',
      body: '<p>Hello</p>',
      recipients: ['A@example.com', 'b@example.com', 'a@example.com', ' c@example.com '],
      startAt: start,
      delayMs: 5000,
      hourlyLimit: 10,
    });

    assert.equal(res.scheduledCount, 3);
    assert.equal(res.duplicatesRemoved, 1);

    const rows = await emailsOf(res.campaign.id);
    assert.deepEqual(rows.map((r) => r.to_email), ['a@example.com', 'b@example.com', 'c@example.com']);
    rows.forEach((r, i) => assert.equal(new Date(r.scheduled_at).getTime(), start.getTime() + i * 5000));
    assert.deepEqual(rows.map((r) => r.sender_id), [1, 2, 1]);

    for (const r of rows) {
      const job = await emailQueue.getJob(jobIdFor(r.id));
      assert.ok(job, `job for email ${r.id} exists`);
      assert.equal(await job!.getState(), 'delayed');
    }
  });

  test('same Idempotency-Key twice = one campaign, no duplicate rows or jobs', async () => {
    const input = {
      userId,
      subject: 'Hi',
      body: 'Hello',
      recipients: ['x@example.com', 'y@example.com'],
      startAt: new Date(Date.now() + 60_000),
      delayMs: 0,
      hourlyLimit: 10,
      clientRequestId: 'key-123',
    };
    const first = await scheduleCampaign(input);
    const second = await scheduleCampaign(input);

    assert.equal(second.replayed, true);
    assert.equal(second.campaign.id, first.campaign.id);
    const { rows } = await query<{ n: string }>('SELECT count(*) AS n FROM emails');
    assert.equal(Number(rows[0].n), 2);
    assert.equal(await emailQueue.getJobCountByTypes('delayed', 'waiting'), 2);
  });

  test('reconciler re-queues an unsent email whose job was lost, and only that one', async () => {
    const res = await scheduleCampaign({
      userId,
      subject: 'Hi',
      body: 'Hello',
      recipients: ['p@example.com', 'q@example.com'],
      startAt: new Date(Date.now() + 60_000),
      delayMs: 0,
      hourlyLimit: 10,
    });
    const [lost] = await emailsOf(res.campaign.id);
    await (await emailQueue.getJob(jobIdFor(lost.id)))!.remove(); // simulate Redis losing it

    assert.equal(await reconcileQueue(), 1);
    assert.ok(await emailQueue.getJob(jobIdFor(lost.id)), 'job is back');
    assert.equal(await reconcileQueue(), 0, 'second run finds nothing to fix');
  });
});
