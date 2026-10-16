import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/session';
import { config } from '../config';
import { countByStatus, findEmailById, listEmailsForUser, STATUS_GROUPS } from '../repositories/emailRepo';
import { findSenderById, listSenders } from '../repositories/senderRepo';
import { htmlToText, SIMULATED_PREFIX } from '../services/mailer';
import { getHourlyUsage } from '../services/rateLimiter';
import { scheduleCampaign } from '../services/scheduler';
import { searchBackend, searchEmails } from '../services/search';
import { EmailRow } from '../types';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const MAX_RECIPIENTS = 5000;

const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(500),
  body: z.string().trim().min(1, 'Body is required').max(50_000),
  recipients: z
    .array(z.string().trim().email('Invalid email address'))
    .min(1, 'Upload at least one email address')
    .max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} recipients per campaign`),
  startTime: z.coerce.date(),
  delayBetweenEmailsMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000),
});

/** Shape sent to the frontend - never leak internal columns. */
function toDto(e: EmailRow) {
  return {
    id: e.id,
    campaignId: e.campaign_id,
    to: e.to_email,
    subject: e.subject,
    preview: htmlToText(e.body).replace(/\s+/g, ' ').slice(0, 140),
    status: e.status,
    scheduledAt: e.scheduled_at,
    sentAt: e.sent_at,
    senderId: e.sender_id,
    previewUrl: e.preview_url,
    simulated: e.message_id?.startsWith(SIMULATED_PREFIX) ?? false,
    error: e.last_error,
    attempts: e.attempts,
    rateLimitedCount: e.rate_limited_count,
  };
}

// POST /api/emails/schedule
emailsRouter.post('/schedule', async (req, res, next) => {
  try {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', issues: parsed.error.issues });
    }
    const input = parsed.data;
    // A start time slightly in the past (clock skew / slow form) just means "now".
    const startAt = input.startTime.getTime() < Date.now() ? new Date() : input.startTime;
    const idempotencyKey = req.header('Idempotency-Key')?.slice(0, 200);

    const result = await scheduleCampaign({
      userId: req.user!.id,
      subject: input.subject,
      body: input.body,
      recipients: input.recipients,
      startAt,
      delayMs: input.delayBetweenEmailsMs,
      hourlyLimit: input.hourlyLimit,
      clientRequestId: idempotencyKey,
    });

    res.status(result.replayed ? 200 : 201).json({
      campaignId: result.campaign.id,
      scheduled: result.scheduledCount,
      duplicatesRemoved: result.duplicatesRemoved,
      replayed: result.replayed,
      startAt: result.campaign.start_at,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails?tab=scheduled|sent&page=1&pageSize=20
emailsRouter.get('/', async (req, res, next) => {
  try {
    const tab = req.query.tab === 'sent' ? 'sent' : 'scheduled';
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const { rows, total } = await listEmailsForUser(req.user!.id, STATUS_GROUPS[tab], pageSize, (page - 1) * pageSize);
    res.json({ items: rows.map(toDto), total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails/search?q=...
emailsRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ items: [], backend: searchBackend() });
    const { results, backend } = await searchEmails(req.user!.id, q.slice(0, 200));
    res.json({ items: results.map(toDto), backend });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails/stats - counts per status + live hourly usage per sender
emailsRouter.get('/stats', async (req, res, next) => {
  try {
    const [counts, senders] = await Promise.all([countByStatus(req.user!.id), listSenders()]);
    const usage = await Promise.all(
      senders.map(async (s) => ({
        senderId: s.id,
        address: s.smtp_user,
        sentThisHour: await getHourlyUsage(`sender:${s.id}`),
        limit: config.worker.maxEmailsPerHourPerSender,
      })),
    );
    res.json({
      counts,
      senders: usage,
      settings: {
        minDelayBetweenSendsMs: config.worker.minDelayBetweenSendsMs,
        maxEmailsPerHourPerSender: config.worker.maxEmailsPerHourPerSender,
        concurrency: config.worker.concurrency,
      },
      searchBackend: searchBackend(),
      smtpMode: config.senders.simulateSmtp ? 'simulated' : 'ethereal',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails/:id - full email for the detail view
emailsRouter.get('/:id', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const email = await findEmailById(req.params.id);
    if (!email || email.user_id !== req.user!.id) return res.status(404).json({ error: 'Email not found' });
    const sender = await findSenderById(email.sender_id);
    res.json({
      ...toDto(email),
      body: email.body,
      fromName: sender?.from_name ?? null,
      fromAddress: sender?.smtp_user ?? null,
    });
  } catch (err) {
    next(err);
  }
});
