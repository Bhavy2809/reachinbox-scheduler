import { query } from '../db/pool';

export interface SlackConnection {
  user_id: string;
  team_id: string | null;
  team_name: string | null;
  channel: string | null;
  channel_id: string | null;
  webhook_url: string;
  access_token: string | null;
  created_at: Date;
}

export async function upsertSlackConnection(c: Omit<SlackConnection, 'created_at'>): Promise<void> {
  await query(
    `INSERT INTO slack_connections (user_id, team_id, team_name, channel, channel_id, webhook_url, access_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       team_id = EXCLUDED.team_id, team_name = EXCLUDED.team_name, channel = EXCLUDED.channel,
       channel_id = EXCLUDED.channel_id, webhook_url = EXCLUDED.webhook_url,
       access_token = EXCLUDED.access_token, created_at = now()`,
    [c.user_id, c.team_id, c.team_name, c.channel, c.channel_id, c.webhook_url, c.access_token],
  );
}

/** Read on every notification (not cached) so connect/disconnect takes effect without a restart. */
export async function getSlackConnection(userId: string): Promise<SlackConnection | null> {
  const { rows } = await query<SlackConnection>('SELECT * FROM slack_connections WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

export async function deleteSlackConnection(userId: string): Promise<void> {
  await query('DELETE FROM slack_connections WHERE user_id = $1', [userId]);
}
