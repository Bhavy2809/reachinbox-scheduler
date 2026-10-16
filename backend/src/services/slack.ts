import { config } from '../config';
import { deleteSlackConnection, getSlackConnection, upsertSlackConnection } from '../repositories/slackRepo';
import { logger } from '../utils/logger';

export function slackConfigured(): boolean {
  return Boolean(config.slack.clientId && config.slack.clientSecret);
}

/** Step 1 of OAuth: where to send the user's browser. */
export function slackAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.slack.clientId ?? '',
    // incoming-webhook: during install the user picks a channel and Slack hands us a webhook URL for it
    scope: 'incoming-webhook',
    redirect_uri: config.slack.redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { channel: string; channel_id: string; url: string };
}

/** Step 2 of OAuth: exchange the one-time code for a token + webhook, and store it for this user. */
export async function completeSlackOAuth(userId: string, code: string): Promise<{ team: string; channel: string }> {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.slack.clientId ?? '',
      client_secret: config.slack.clientSecret ?? '',
      code,
      redirect_uri: config.slack.redirectUri,
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook?.url) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'no incoming webhook returned'}`);
  }
  await upsertSlackConnection({
    user_id: userId,
    team_id: data.team?.id ?? null,
    team_name: data.team?.name ?? null,
    channel: data.incoming_webhook.channel,
    channel_id: data.incoming_webhook.channel_id,
    webhook_url: data.incoming_webhook.url,
    access_token: data.access_token ?? null,
  });
  return { team: data.team?.name ?? 'Slack', channel: data.incoming_webhook.channel };
}

/**
 * Post a message to the user's connected channel.
 * - Not connected -> silently does nothing (rate limiting must never crash because of Slack).
 * - The connection is read from the DB on every call, so connecting later works without a redeploy.
 * - If Slack says the webhook is gone (app uninstalled / channel deleted), we drop the connection.
 */
export async function notifySlack(userId: string, text: string): Promise<boolean> {
  try {
    const conn = await getSlackConnection(userId);
    if (!conn) return false;
    const res = await fetch(conn.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 404 || res.status === 410 || res.status === 403) {
      logger.warn(`Slack webhook for user ${userId} is no longer valid (${res.status}); removing connection`);
      await deleteSlackConnection(userId);
      return false;
    }
    if (!res.ok) {
      logger.warn(`Slack webhook returned ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('Slack notification failed', (err as Error).message);
    return false;
  }
}
