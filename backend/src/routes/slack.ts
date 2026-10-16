import { Router } from 'express';
import { readSession, requireAuth, signState, verifyState } from '../auth/session';
import { config } from '../config';
import { deleteSlackConnection, getSlackConnection } from '../repositories/slackRepo';
import { completeSlackOAuth, notifySlack, slackAuthorizeUrl, slackConfigured } from '../services/slack';
import { logger } from '../utils/logger';

export const slackRouter = Router();

// GET /api/slack/status
slackRouter.get('/status', requireAuth, async (req, res, next) => {
  try {
    const conn = await getSlackConnection(req.user!.id);
    res.json({
      configured: slackConfigured(),
      connected: Boolean(conn),
      team: conn?.team_name ?? null,
      channel: conn?.channel ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/slack/connect  (browser navigation, not fetch) -> Slack consent screen
slackRouter.get('/connect', requireAuth, (req, res) => {
  if (!slackConfigured()) return res.status(500).send('Slack is not configured on the server (SLACK_CLIENT_ID/SECRET)');
  // The state carries WHO is connecting, signed so it can't be forged or swapped.
  res.redirect(slackAuthorizeUrl(signState({ uid: req.user!.id, purpose: 'slack' })));
});

// GET /api/slack/callback?code=...&state=...
slackRouter.get('/callback', async (req, res) => {
  const back = (q: string) => res.redirect(`${config.frontendUrl}/dashboard?${q}`);
  try {
    if (req.query.error) return back(`slack=denied`);
    const state = verifyState<{ uid: string; purpose: string }>(String(req.query.state ?? ''));
    if (!state || state.purpose !== 'slack') return back('slack=invalid_state');
    // If the browser still has a session, it must be the same user who started the flow.
    const session = readSession(req);
    if (session && session.id !== state.uid) return back('slack=user_mismatch');

    const { team, channel } = await completeSlackOAuth(state.uid, String(req.query.code ?? ''));
    await notifySlack(state.uid, `:white_check_mark: ReachInbox connected. Rate-limit alerts will be posted in ${channel}.`);
    back(`slack=connected&team=${encodeURIComponent(team)}`);
  } catch (err) {
    logger.error('Slack OAuth callback failed', (err as Error).message);
    back('slack=error');
  }
});

// POST /api/slack/test - send a test message (handy in the demo)
slackRouter.post('/test', requireAuth, async (req, res) => {
  const ok = await notifySlack(req.user!.id, ':bell: Test notification from ReachInbox scheduler.');
  res.status(ok ? 200 : 400).json({ ok });
});

// DELETE /api/slack - disconnect
slackRouter.delete('/', requireAuth, async (req, res, next) => {
  try {
    await deleteSlackConnection(req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
