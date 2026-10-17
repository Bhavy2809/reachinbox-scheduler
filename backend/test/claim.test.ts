import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { query } from '../src/db/pool';
import { claimForSending, findEmailById, markSent, reschedule } from '../src/repositories/emailRepo';
import { closeAll, createUser, resetState } from './helpers';

const LOCK_TTL = 60_000;

async function insertEmail(): Promise<string> {
  const userId = await createUser();
  const { rows: c } = await query<{ id: string }>(
    `INSERT INTO campaigns (user_id, subject, body, start_at, delay_ms, hourly_limit, total)
     VALUES ($1, 's', 'b', now(), 0, 10, 1) RETURNING id`,
    [userId],
  );
  const { rows } = await query<{ id: string }>(
    `INSERT INTO emails (campaign_id, user_id, sender_id, to_email, subject, body, scheduled_at)
     VALUES ($1, $2, 1, 'lead@example.com', 's', 'b', now()) RETURNING id`,
    [c[0].id, userId],
  );
  return rows[0].id;
}

describe('atomic claim (idempotent sending)', () => {
  beforeEach(async () => {
    await resetState();
  });
  after(closeAll);

  test('30 workers claim the same email at once: exactly one wins', async () => {
    const id = await insertEmail();
    const results = await Promise.all(Array.from({ length: 30 }, () => claimForSending(id, LOCK_TTL)));
    assert.equal(results.filter(Boolean).length, 1);
    const row = await findEmailById(id);
    assert.equal(row?.status, 'sending');
    assert.equal(row?.attempts, 1);
  });

  test('a sent email can never be claimed again', async () => {
    const id = await insertEmail();
    assert.ok(await claimForSending(id, LOCK_TTL));
    assert.ok(await markSent(id, '<m@x>', null));
    assert.equal(await claimForSending(id, LOCK_TTL), null);
    assert.equal(await markSent(id, '<m@x>', null), null, 'markSent is a no-op on an already-sent row');
  });

  test('a live lock blocks takeover; an expired lock (crashed worker) allows it', async () => {
    const id = await insertEmail();
    assert.ok(await claimForSending(id, LOCK_TTL));
    assert.equal(await claimForSending(id, LOCK_TTL), null, 'fresh lock must block');

    await query(`UPDATE emails SET locked_at = now() - interval '2 minutes' WHERE id = $1`, [id]);
    const takeover = await claimForSending(id, LOCK_TTL);
    assert.ok(takeover, 'stale lock must be taken over');
    assert.equal(takeover?.attempts, 2);
  });

  test('rescheduling a stale "sending" row hands it back to "scheduled"', async () => {
    const id = await insertEmail();
    await claimForSending(id, LOCK_TTL);
    const later = new Date(Date.now() + 3_600_000);
    await reschedule(id, later, true);
    const row = await findEmailById(id);
    assert.equal(row?.status, 'scheduled');
    assert.equal(row?.locked_at, null);
    assert.equal(row?.rate_limited_count, 1);
    assert.equal(new Date(row!.scheduled_at).getTime(), later.getTime());
  });
});
