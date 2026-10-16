import { redis } from '../redis';

/**
 * All limits live in Redis, so every worker process on every machine sees the same numbers.
 * Each check runs as a Lua script: Redis executes a script atomically, so two workers can
 * never both read "199 of 200" and both send.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Fixed clock-hour windows: 10:00-10:59 is one window, 11:00-11:59 the next. */
export function hourWindow(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS);
}

export function windowStartMs(window: number): number {
  return window * HOUR_MS;
}

// ---------------------------------------------------------------------------
// 1) Minimum gap between two sends from the same sender
// ---------------------------------------------------------------------------
// Instead of "try, fail, retry later" (which makes 1000 jobs hammer Redis every 2s),
// each job RESERVES the next free slot: slot = max(now, lastSlot + gap).
// Jobs get consecutive slots in the order they ask, so order is preserved and nobody spins.
const RESERVE_SLOT_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local gap = tonumber(ARGV[1])
local last = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = now
if last + gap > slot then slot = last + gap end
redis.call('SET', KEYS[1], slot, 'PX', (slot - now) + gap + 60000)
return {slot, now}
`;

/** Returns the epoch ms at which this job may send, and Redis' current time. */
export async function reserveSendSlot(senderId: number, gapMs: number): Promise<{ slotAt: number; now: number }> {
  if (gapMs <= 0) return { slotAt: Date.now(), now: Date.now() };
  const [slotAt, now] = (await redis.eval(RESERVE_SLOT_LUA, 1, `throttle:sender:${senderId}:last`, gapMs)) as [
    number,
    number,
  ];
  return { slotAt: Number(slotAt), now: Number(now) };
}

// ---------------------------------------------------------------------------
// 2) Emails per hour - check every limit, and only if ALL pass, count the send in ALL of them
// ---------------------------------------------------------------------------
const CONSUME_HOURLY_LUA = `
local ttl = tonumber(ARGV[#ARGV])
for i = 1, #KEYS do
  local used = tonumber(redis.call('GET', KEYS[i]) or '0')
  if used >= tonumber(ARGV[i]) then
    return i
  end
end
for i = 1, #KEYS do
  redis.call('INCR', KEYS[i])
  redis.call('PEXPIRE', KEYS[i], ttl)
end
return 0
`;

export interface HourlyLimit {
  /** e.g. "sender:3" or "campaign:17" */
  scope: string;
  limit: number;
}

export type HourlyResult =
  | { allowed: true; keys: string[] }
  | { allowed: false; blockedBy: HourlyLimit; window: number };

export async function consumeHourly(limits: HourlyLimit[], nowMs = Date.now()): Promise<HourlyResult> {
  const window = hourWindow(nowMs);
  const keys = limits.map((l) => `ratelimit:${l.scope}:${window}`);
  // Keep counters a bit longer than the window so late readers still see them.
  const ttl = HOUR_MS + 5 * 60 * 1000;
  const hit = Number(await redis.eval(CONSUME_HOURLY_LUA, keys.length, ...keys, ...limits.map((l) => l.limit), ttl));
  if (hit === 0) return { allowed: true, keys };
  return { allowed: false, blockedBy: limits[hit - 1], window };
}

/**
 * The limit is full: give this job a place in the NEXT window.
 * A per-window counter hands out positions 0,1,2... in arrival order, and each position is
 * spaced by the send gap, so overflowed jobs keep their relative order instead of all
 * waking at exactly hh:00:00 and racing.
 */
export async function nextWindowRunAt(scope: string, window: number, limit: number, gapMs: number): Promise<number> {
  const key = `ratelimit:overflow:${scope}:${window}`;
  const pos = (await redis.incr(key)) - 1; // 0-based place in the overflow line
  await redis.pexpire(key, 3 * HOUR_MS);
  // 1000 jobs over a 200/hour limit: places 0-199 go to the next hour, 200-399 the hour after, ...
  const windowsAhead = 1 + Math.floor(pos / limit);
  const placeInWindow = pos % limit;
  return windowStartMs(window + windowsAhead) + placeInWindow * Math.max(gapMs, 50);
}

/** Returns true exactly once per scope+window - used so Slack gets one message, not hundreds. */
export async function firstHitInWindow(scope: string, window: number): Promise<boolean> {
  const res = await redis.set(`ratelimit:notified:${scope}:${window}`, '1', 'PX', HOUR_MS + 60000, 'NX');
  return res === 'OK';
}

export async function getHourlyUsage(scope: string, nowMs = Date.now()): Promise<number> {
  const v = await redis.get(`ratelimit:${scope}:${hourWindow(nowMs)}`);
  return Number(v ?? 0);
}

// ---------------------------------------------------------------------------
// 3) Refund - give the hourly quota back when the SMTP send itself failed
// ---------------------------------------------------------------------------
// Without this, a transient SMTP error burns quota: the retry then finds the hour
// "full" and gets pushed to the next window even though nothing was delivered.
const REFUND_LUA = `
for i = 1, #KEYS do
  local used = tonumber(redis.call('GET', KEYS[i]) or '0')
  if used > 0 then redis.call('DECR', KEYS[i]) end
end
return 1
`;

export async function refundHourly(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await redis.eval(REFUND_LUA, keys.length, ...keys);
}
