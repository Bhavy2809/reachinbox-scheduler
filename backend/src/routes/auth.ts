import crypto from 'crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { clearSessionCookie, readSession, setSessionCookie, signState, verifyState } from '../auth/session';
import { config } from '../config';
import { upsertGoogleUser } from '../repositories/userRepo';
import { logger } from '../utils/logger';

export const authRouter = Router();

const STATE_COOKIE = 'ri_oauth_state';

function googleClient(): OAuth2Client {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
  }
  return new OAuth2Client(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

// Step 1: send the browser to Google's consent screen.
authRouter.get('/google', (_req, res) => {
  try {
    const nonce = crypto.randomBytes(16).toString('hex');
    // state = signed nonce; the same nonce goes in a cookie. On return both must match,
    // which proves the callback was started by this browser (login CSRF protection).
    res.cookie(STATE_COOKIE, nonce, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
    const url = googleClient().generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state: signState({ nonce }),
    });
    res.redirect(url);
  } catch (err) {
    res.status(500).send((err as Error).message);
  }
});

// Step 2: Google redirects back with ?code=...&state=...
authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${config.frontendUrl}/?error=${encodeURIComponent(reason)}`);
  try {
    const code = String(req.query.code ?? '');
    const state = verifyState<{ nonce: string }>(String(req.query.state ?? ''));
    if (!code) return fail('missing_code');
    if (!state || state.nonce !== req.cookies?.[STATE_COOKIE]) return fail('invalid_state');
    res.clearCookie(STATE_COOKIE);

    const client = googleClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return fail('no_id_token');

    // Verify Google's signature on the ID token and that it was issued for OUR client id.
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) return fail('invalid_profile');

    const user = await upsertGoogleUser({
      googleId: p.sub,
      email: p.email,
      name: p.name ?? null,
      avatarUrl: p.picture ?? null,
    });
    setSessionCookie(res, { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url });
    res.redirect(`${config.frontendUrl}/dashboard`);
  } catch (err) {
    logger.error('Google OAuth callback failed', (err as Error).message);
    fail('oauth_failed');
  }
});

authRouter.get('/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});
