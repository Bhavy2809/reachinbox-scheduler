import { query } from '../db/pool';
import { EmailRow, EmailStatus } from '../types';

export async function findEmailById(id: string): Promise<EmailRow | null> {
  const { rows } = await query<EmailRow>('SELECT * FROM emails WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** Email row plus the campaign's hourly limit (needed by the worker for every send). */
export async function findEmailForSend(id: string): Promise<(EmailRow & { hourly_limit: number }) | null> {
  const { rows } = await query<EmailRow & { hourly_limit: number }>(
    `SELECT e.*, c.hourly_limit FROM emails e JOIN campaigns c ON c.id = e.campaign_id WHERE e.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Atomically take ownership of an email before sending it.
 *
 * Only ONE caller can win this UPDATE: Postgres row-locks the row, re-checks the WHERE
 * clause after any concurrent update commits, and the loser gets zero rows back.
 * A row stuck in 'sending' (its worker crashed) can be taken over only after the lock TTL.
 */
export async function claimForSending(id: string, lockTtlMs: number): Promise<EmailRow | null> {
  const { rows } = await query<EmailRow>(
    `UPDATE emails
        SET status = 'sending', locked_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = $1
        AND (status = 'scheduled'
             OR (status = 'sending' AND locked_at < now() - ($2::int * interval '1 millisecond')))
      RETURNING *`,
    [id, lockTtlMs],
  );
  return rows[0] ?? null;
}

export async function markSent(id: string, messageId: string, previewUrl: string | null): Promise<EmailRow | null> {
  const { rows } = await query<EmailRow>(
    `UPDATE emails
        SET status = 'sent', sent_at = now(), message_id = $2, preview_url = $3,
            locked_at = NULL, last_error = NULL, updated_at = now()
      WHERE id = $1 AND status = 'sending'
      RETURNING *`,
    [id, messageId, previewUrl],
  );
  return rows[0] ?? null;
}

/** SMTP failed but we will retry: hand the row back so the next attempt can claim it. */
export async function releaseForRetry(id: string, error: string): Promise<void> {
  await query(
    `UPDATE emails SET status = 'scheduled', locked_at = NULL, last_error = $2, updated_at = now()
      WHERE id = $1 AND status = 'sending'`,
    [id, error],
  );
}

export async function markFailed(id: string, error: string): Promise<EmailRow | null> {
  const { rows } = await query<EmailRow>(
    `UPDATE emails SET status = 'failed', locked_at = NULL, last_error = $2, sent_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('scheduled', 'sending')
      RETURNING *`,
    [id, error],
  );
  return rows[0] ?? null;
}

/**
 * Move an unsent email to a later time (used when the hourly limit is reached).
 * Also clears a STALE 'sending' state: the worker only gets here for a 'sending' row after
 * its lock has expired (a worker died mid-send), so handing it back to 'scheduled' is safe
 * and keeps the dashboard honest instead of showing "Sending..." for an hour.
 */
export async function reschedule(id: string, runAt: Date, dueToRateLimit: boolean): Promise<void> {
  await query(
    `UPDATE emails
        SET scheduled_at = $2,
            rate_limited_count = rate_limited_count + $3,
            status = 'scheduled',
            locked_at = NULL,
            updated_at = now()
      WHERE id = $1 AND status IN ('scheduled', 'sending')`,
    [id, runAt, dueToRateLimit ? 1 : 0],
  );
}

export const STATUS_GROUPS: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['scheduled', 'sending'],
  sent: ['sent', 'failed'],
};

export async function listEmailsForUser(
  userId: string,
  statuses: EmailStatus[],
  limit: number,
  offset: number,
): Promise<{ rows: EmailRow[]; total: number }> {
  // Scheduled tab: soonest first. Sent tab: most recent first.
  const order = statuses.includes('sent') ? 'sent_at DESC NULLS LAST, id DESC' : 'scheduled_at ASC, id ASC';
  const [list, count] = await Promise.all([
    query<EmailRow>(
      `SELECT * FROM emails WHERE user_id = $1 AND status = ANY($2::text[])
        ORDER BY ${order} LIMIT $3 OFFSET $4`,
      [userId, statuses, limit, offset],
    ),
    query<{ count: string }>('SELECT count(*) FROM emails WHERE user_id = $1 AND status = ANY($2::text[])', [
      userId,
      statuses,
    ]),
  ]);
  return { rows: list.rows, total: Number(count.rows[0].count) };
}

export async function countByStatus(userId: string): Promise<Record<EmailStatus, number>> {
  const { rows } = await query<{ status: EmailStatus; count: string }>(
    'SELECT status, count(*) FROM emails WHERE user_id = $1 GROUP BY status',
    [userId],
  );
  const out: Record<EmailStatus, number> = { scheduled: 0, sending: 0, sent: 0, failed: 0 };
  for (const r of rows) out[r.status] = Number(r.count);
  return out;
}

/** Fallback search when Elasticsearch is not available. */
export async function searchEmailsSql(userId: string, q: string, limit: number): Promise<EmailRow[]> {
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const { rows } = await query<EmailRow>(
    `SELECT * FROM emails
      WHERE user_id = $1 AND (to_email ILIKE $2 OR subject ILIKE $2 OR body ILIKE $2)
      ORDER BY created_at DESC LIMIT $3`,
    [userId, like, limit],
  );
  return rows;
}

export async function findEmailsByIds(userId: string, ids: string[]): Promise<EmailRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<EmailRow>('SELECT * FROM emails WHERE user_id = $1 AND id = ANY($2::bigint[])', [
    userId,
    ids,
  ]);
  return rows;
}

/** Keyset-paginated scan of every email that still has to be sent (used by the startup reconciler). */
export async function findUnsentAfter(afterId: string, limit: number): Promise<EmailRow[]> {
  const { rows } = await query<EmailRow>(
    `SELECT * FROM emails WHERE status IN ('scheduled', 'sending') AND id > $1 ORDER BY id LIMIT $2`,
    [afterId, limit],
  );
  return rows;
}
