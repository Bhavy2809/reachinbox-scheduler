import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { redis } from '../src/redis';
import {
  consumeHourly,
  firstHitInWindow,
  hourWindow,
  nextWindowRunAt,
  refundHourly,
  reserveSendSlot,
  windowStartMs,
} from '../src/services/rateLimiter';
import { closeAll, resetState } from './helpers';

const HOUR = 3_600_000;

describe('rate limiter (Redis + Lua)', () => {
  beforeEach(async () => {
    await resetState();
  });
  after(closeAll);

  test('hour windows are fixed clock hours', () => {
    const t = Date.UTC(2026, 9, 17, 10, 59, 59, 999);
    assert.equal(hourWindow(t) + 1, hourWindow(t + 1));
    assert.equal(windowStartMs(hourWindow(t)), Date.UTC(2026, 9, 17, 10, 0, 0, 0));
  });

  test('200 concurrent sends against a limit of 50: exactly 50 are allowed', async () => {
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 200 }, () => consumeHourly([{ scope: 'sender:1', limit: 50 }], now)),
    );
    assert.equal(results.filter((r) => r.allowed).length, 50);
    assert.equal(Number(await redis.get(`ratelimit:sender:1:${hourWindow(now)}`)), 50);
  });

  test('all limits are checked together; a rejected send increments nothing', async () => {
    const now = Date.now();
    const limits = [
      { scope: 'sender:1', limit: 5 },
      { scope: 'campaign:9', limit: 3 },
    ];
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push(await consumeHourly(limits, now));

    assert.deepEqual(outcomes.map((o) => o.allowed), [true, true, true, false, false]);
    const blocked = outcomes[3];
    assert.ok(!blocked.allowed && blocked.blockedBy.scope === 'campaign:9');
    // The sender counter must stop at 3: the campaign limit blocked the 4th and 5th.
    assert.equal(Number(await redis.get(`ratelimit:sender:1:${hourWindow(now)}`)), 3);
  });

  test('refund gives quota back and never goes below zero', async () => {
    const now = Date.now();
    const r = await consumeHourly([{ scope: 'sender:2', limit: 1 }], now);
    assert.ok(r.allowed);
    assert.equal((await consumeHourly([{ scope: 'sender:2', limit: 1 }], now)).allowed, false);

    await refundHourly(r.keys);
    assert.equal((await consumeHourly([{ scope: 'sender:2', limit: 1 }], now)).allowed, true);

    await refundHourly(r.keys);
    await refundHourly(r.keys); // already 0 -> stays 0
    assert.equal(Number(await redis.get(r.keys[0])), 0);
  });

  test('send slots per sender are reserved gap ms apart, in order', async () => {
    const slots = [];
    for (let i = 0; i < 5; i++) slots.push((await reserveSendSlot(7, 1000)).slotAt);
    for (let i = 1; i < slots.length; i++) assert.equal(slots[i] - slots[i - 1], 1000);
  });

  test('overflow places fill the next window first, then the one after', async () => {
    const window = hourWindow(Date.now());
    const runAts = [];
    for (let i = 0; i < 5; i++) runAts.push(await nextWindowRunAt('campaign:1', window, 2, 2000));

    const next = windowStartMs(window + 1);
    assert.deepEqual(runAts, [next, next + 2000, next + HOUR, next + HOUR + 2000, next + 2 * HOUR]);
  });

  test('Slack is told only once per scope per window', async () => {
    const w = hourWindow(Date.now());
    assert.equal(await firstHitInWindow('sender:1', w), true);
    assert.equal(await firstHitInWindow('sender:1', w), false);
    assert.equal(await firstHitInWindow('sender:2', w), true);
    assert.equal(await firstHitInWindow('sender:1', w + 1), true);
  });
});
