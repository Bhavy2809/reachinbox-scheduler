import IORedis, { Redis } from 'ioredis';
import { config } from './config';
import { logger } from './utils/logger';

/**
 * BullMQ requires maxRetriesPerRequest = null on connections used by Workers
 * (blocking commands must wait forever instead of erroring).
 */
export function createRedisConnection(name: string): Redis {
  // family: 0 = resolve both IPv4 and IPv6 (Railway's private network is IPv6-only)
  const conn = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, family: 0 });
  conn.on('error', (err) => logger.error(`Redis (${name}) error`, err.message));
  return conn;
}

/** Shared connection for app-level commands (rate limit counters, locks). */
export const redis = createRedisConnection('app');
