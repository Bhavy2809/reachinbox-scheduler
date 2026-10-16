import { query } from '../db/pool';
import { SenderRow } from '../types';

export async function listSenders(): Promise<SenderRow[]> {
  const { rows } = await query<SenderRow>('SELECT * FROM senders ORDER BY id');
  return rows;
}

export async function findSenderById(id: number): Promise<SenderRow | null> {
  const { rows } = await query<SenderRow>('SELECT * FROM senders WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function insertSender(s: Omit<SenderRow, 'id'>): Promise<void> {
  await query(
    `INSERT INTO senders (smtp_host, smtp_port, smtp_user, smtp_pass, from_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (smtp_user) DO NOTHING`,
    [s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, s.from_name],
  );
}
