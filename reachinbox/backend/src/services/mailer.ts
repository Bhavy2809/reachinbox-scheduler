import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';
import { insertSender, listSenders } from '../repositories/senderRepo';
import { SenderRow } from '../types';
import { logger } from '../utils/logger';

const DEFAULT_HOST = 'smtp.ethereal.email';
const DEFAULT_PORT = 587;

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
      const account = await nodemailer.createTestAccount();
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
    });
    transporters.set(sender.id, t);
  }
  return t;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

export async function sendEmail(
  sender: SenderRow,
  msg: { emailId: string; to: string; subject: string; body: string },
): Promise<SendResult> {
  const domain = sender.smtp_user.split('@')[1] ?? 'reachinbox.local';
  // Deterministic Message-ID: if a crash ever forces a resend, the receiving side sees
  // the same ID and can de-duplicate it (see README: idempotency).
  const messageId = `<email-${msg.emailId}@${domain}>`;
  const info = await transporterFor(sender).sendMail({
    from: `"${sender.from_name}" <${sender.smtp_user}>`,
    to: msg.to,
    subject: msg.subject,
    text: msg.body,
    messageId,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId ?? messageId, previewUrl: preview || null };
}

export function closeTransporters(): void {
  for (const t of transporters.values()) t.close();
  transporters.clear();
}
