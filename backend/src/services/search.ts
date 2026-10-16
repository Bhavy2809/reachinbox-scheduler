import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import { findEmailsByIds, searchEmailsSql } from '../repositories/emailRepo';
import { EmailRow } from '../types';
import { logger } from '../utils/logger';

/**
 * Elasticsearch is a secondary index, never the source of truth.
 * Every write here is best-effort: if ES is down, scheduling and sending carry on,
 * and search falls back to SQL ILIKE.
 */

let client: Client | null = null;
let available = false;
const index = config.elasticsearch.index;

export async function initSearch(): Promise<void> {
  if (!config.elasticsearch.url) {
    logger.warn('ELASTICSEARCH_URL not set - search will use the SQL fallback');
    return;
  }
  try {
    client = new Client({ node: config.elasticsearch.url });
    await client.ping();
    const exists = await client.indices.exists({ index });
    if (!exists) {
      await client.indices.create({
        index,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            user_id: { type: 'keyword' },
            campaign_id: { type: 'keyword' },
            to_email: { type: 'text', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduled_at: { type: 'date' },
            sent_at: { type: 'date' },
          },
        },
      });
      logger.info(`Created Elasticsearch index "${index}"`);
    }
    available = true;
    logger.info('Elasticsearch connected');
  } catch (err) {
    available = false;
    logger.warn('Elasticsearch unreachable - search will use the SQL fallback', (err as Error).message);
  }
}

export function searchBackend(): 'elasticsearch' | 'sql' {
  return available ? 'elasticsearch' : 'sql';
}

function toDoc(e: EmailRow) {
  return {
    id: e.id,
    user_id: e.user_id,
    campaign_id: e.campaign_id,
    to_email: e.to_email,
    subject: e.subject,
    body: e.body,
    status: e.status,
    scheduled_at: e.scheduled_at,
    sent_at: e.sent_at,
  };
}

export async function indexEmails(emails: EmailRow[]): Promise<void> {
  if (!available || !client || emails.length === 0) return;
  try {
    const operations = emails.flatMap((e) => [{ index: { _index: index, _id: e.id } }, toDoc(e)]);
    const res = await client.bulk({ operations, refresh: false });
    if (res.errors) logger.warn('Some emails failed to index in Elasticsearch');
  } catch (err) {
    logger.warn('Elasticsearch bulk index failed', (err as Error).message);
  }
}

/** Upsert the latest state of one email (status, sent_at, new scheduled time...). */
export async function indexEmail(email: EmailRow | null): Promise<void> {
  if (!email || !available || !client) return;
  try {
    await client.index({ index, id: email.id, document: toDoc(email) });
  } catch (err) {
    logger.warn(`Elasticsearch index failed for email ${email.id}`, (err as Error).message);
  }
}

export async function searchEmails(
  userId: string,
  q: string,
  limit = 50,
): Promise<{ results: EmailRow[]; backend: 'elasticsearch' | 'sql' }> {
  if (available && client) {
    try {
      const res = await client.search<{ id: string }>({
        index,
        size: limit,
        query: {
          bool: {
            filter: [{ term: { user_id: userId } }],
            must: [
              {
                multi_match: {
                  query: q,
                  fields: ['to_email^3', 'subject^2', 'body'],
                  type: 'bool_prefix',
                },
              },
            ],
          },
        },
      });
      const ids = res.hits.hits.map((h) => h._id).filter((id): id is string => Boolean(id));
      // Hydrate from Postgres so the UI always shows the current status, in ES relevance order.
      const rows = await findEmailsByIds(userId, ids);
      const byId = new Map(rows.map((r) => [r.id, r]));
      return { results: ids.map((id) => byId.get(id)).filter((r): r is EmailRow => Boolean(r)), backend: 'elasticsearch' };
    } catch (err) {
      logger.warn('Elasticsearch search failed - using SQL fallback', (err as Error).message);
    }
  }
  return { results: await searchEmailsSql(userId, q, limit), backend: 'sql' };
}
