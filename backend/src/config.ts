import 'dotenv/config';

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env variable ${name}`);
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Env ${name} must be a non-negative integer, got "${raw}"`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

const backendUrl = str('BACKEND_URL', 'http://localhost:4000');

export const config = {
  port: int('PORT', 4000),
  frontendUrl: str('FRONTEND_URL', 'http://localhost:3000'),
  backendUrl,
  jwtSecret: str('JWT_SECRET', 'dev-only-secret-change-me'),
  runWorkerInApi: bool('RUN_WORKER_IN_API', false),
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl: str('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/reachinbox'),
  redisUrl: str('REDIS_URL', 'redis://localhost:6379'),

  elasticsearch: {
    url: optional('ELASTICSEARCH_URL'),
    index: str('ELASTICSEARCH_INDEX', 'emails'),
  },

  worker: {
    concurrency: Math.max(1, int('WORKER_CONCURRENCY', 5)),
    minDelayBetweenSendsMs: int('MIN_DELAY_BETWEEN_SENDS_MS', 2000),
    maxEmailsPerHourPerSender: Math.max(1, int('MAX_EMAILS_PER_HOUR_PER_SENDER', 200)),
    sendMaxAttempts: Math.max(1, int('SEND_MAX_ATTEMPTS', 3)),
    sendLockTtlMs: int('SEND_LOCK_TTL_MS', 60000),
  },

  senders: {
    count: Math.max(1, int('SENDER_COUNT', 3)),
    etherealAccounts: optional('ETHEREAL_ACCOUNTS'),
    smtpHost: optional('SMTP_HOST'),
    smtpPort: optional('SMTP_PORT') ? Number(optional('SMTP_PORT')) : undefined,
    // Hosts like Railway/Render (non-Pro plans) block ALL outbound SMTP ports. When true,
    // the worker runs the full pipeline (claim, limits, Slack) but builds the message
    // locally instead of opening an SMTP connection. Clearly labelled "simulated" in the UI.
    simulateSmtp: bool('SMTP_SIMULATE', false),
  },

  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
    redirectUri: `${backendUrl}/auth/google/callback`,
  },

  slack: {
    clientId: optional('SLACK_CLIENT_ID'),
    clientSecret: optional('SLACK_CLIENT_SECRET'),
    redirectUri: optional('SLACK_REDIRECT_URI') ?? `${backendUrl}/api/slack/callback`,
  },
} as const;

export const QUEUE_NAME = 'email-send';
