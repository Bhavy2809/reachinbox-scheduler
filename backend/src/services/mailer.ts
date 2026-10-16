import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';
import { insertSender, listSenders } from '../repositories/senderRepo';
import { SenderRow } from '../types';
import { logger } from '../utils/logger';

const DEFAULT_HOST = 'smtp.ethereal.email';
const DEFAULT_PORT = 587;

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
}

/**
 * Create a fresh Ethereal account through Ethereal's API.
 * We don't use nodemailer.createTestAccount() here: it caches the first account for the
 * whole process, so calling it 3 times returns the SAME account 3 times.
 */
async function createEtherealAccount(): Promise<EtherealAccount> {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'reachinbox-scheduler', version: '1.0.0' }),
  });
  const data = (await res.json()) as Partial<EtherealAccount> & { status?: string; error?: string };
  if (!res.ok || data.status !== 'success' || !data.user || !data.pass || !data.smtp) {
    throw new Error(`Could not create Ethereal account: ${data.error ?? res.status}`);
  }
  return { user: data.user, pass: data.pass, smtp: data.smtp };
}

/**
 * Make sure we have SENDER_COUNT Ethereal accounts.
 * - ETHEREAL_ACCOUNTS="user:pass,user:pass" -> use exactly those
 * - otherwise create throwaway accounts through Ethereal's API, once, and store them in the DB
 *   (so a restart keeps the same senders and the same rate-limit counters).
 */
export async function ensureSenders(): Promise<SenderRow[]> {
  const host = config.senders.smtpHost ?? DEFAULT_HOST;
  const port = config.senders.smtpPort ?? DEFAULT_PORT;

  if (config.senders.etherealAccounts) {
    const pairs = config.senders.etherealAccounts.split(',').map((s) => s.trim()).filter(Boolean);
    for (const [i, pair] of pairs.entries()) {
      const idx = pair.indexOf(':');
      if (idx < 0) throw new Error(`ETHEREAL_ACCOUNTS entry "${pair}" must look like user:pass`);
      await insertSender({
        smtp_host: host,
        smtp_port: port,
        smtp_user: pair.slice(0, idx),
        smtp_pass: pair.slice(idx + 1),
        from_name: `ReachInbox Sender ${i + 1}`,
      });
    }
  } else {
    const existing = await listSenders();
    for (let i = existing.length; i < config.senders.count; i++) {
      const account = await createEtherealAccount();
      await insertSender({
        smtp_host: account.smtp.host,
        smtp_port: account.smtp.port,
        smtp_user: account.user,
        smtp_pass: account.pass,
        from_name: `ReachInbox Sender ${i + 1}`,
      });
      logger.info(`Created Ethereal sender ${account.user} (inbox: https://ethereal.email/login)`);
    }
  }

  const senders = await listSenders();
  if (senders.length === 0) throw new Error('No senders configured');
  return senders;
}

// One pooled SMTP connection per sender, created lazily and reused.
const transporters = new Map<number, Transporter>();

function transporterFor(sender: SenderRow): Transporter {
  let t = transporters.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtp_host,
      port: sender.smtp_port,
      secure: sender.smtp_port === 465,
      auth: { user: sender.smtp_user, pass: sender.smtp_pass },
      pool: true,
      maxConnections: 2,
      // Fail fast instead of nodemailer's 2-minute default, so a blocked/unreachable
      // SMTP server turns into a retry (or 'failed') quickly rather than a long 'sending'.
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    transporters.set(sender.id, t);
  }
  return t;
}

/** Very small HTML -> text conversion for the plain-text part and list previews. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

/** Message-ID prefix that marks a send made with SMTP_SIMULATE=true. */
export const SIMULATED_PREFIX = 'simulated:';

// Builds the full MIME message in memory; no network connection.
const simulatedTransport = nodemailer.createTransport({ jsonTransport: true });

export async function sendEmail(
  sender: SenderRow,
  msg: { emailId: string; to: string; subject: string; body: string },
): Promise<SendResult> {
  const domain = sender.smtp_user.split('@')[1] ?? 'reachinbox.local';
  // Deterministic Message-ID: if a crash ever forces a resend, the receiving side sees
  // the same ID and can de-duplicate it (see README: idempotency).
  const messageId = `<email-${msg.emailId}@${domain}>`;
  const transport = config.senders.simulateSmtp ? simulatedTransport : transporterFor(sender);
  const info = await transport.sendMail({
    from: `"${sender.from_name}" <${sender.smtp_user}>`,
    to: msg.to,
    subject: msg.subject,
    // The compose editor produces HTML; send it as HTML with a plain-text fallback.
    ...(/<[a-z][\s\S]*>/i.test(msg.body)
      ? { html: msg.body, text: htmlToText(msg.body) }
      : { text: msg.body }), // plain-text bodies (e.g. load test) stay plain text
    messageId,
  });
  if (config.senders.simulateSmtp) {
    return { messageId: `${SIMULATED_PREFIX}${messageId}`, previewUrl: null };
  }
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId ?? messageId, previewUrl: preview || null };
}

export function closeTransporters(): void {
  for (const t of transporters.values()) t.close();
  transporters.clear();
}
