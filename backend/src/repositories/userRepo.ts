import { query } from '../db/pool';
import { UserRow } from '../types';

export async function upsertGoogleUser(input: {
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (google_id, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_id) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
     RETURNING *`,
    [input.googleId, input.email, input.name, input.avatarUrl],
  );
  return rows[0];
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}
