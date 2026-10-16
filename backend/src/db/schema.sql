-- Idempotent schema: safe to run on every boot.

CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  google_id   TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ethereal SMTP accounts we send from. Several senders = several independent rate limits.
CREATE TABLE IF NOT EXISTS senders (
  id          SERIAL PRIMARY KEY,
  smtp_host   TEXT NOT NULL,
  smtp_port   INT  NOT NULL,
  smtp_user   TEXT NOT NULL UNIQUE,
  smtp_pass   TEXT NOT NULL,
  from_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One "Compose" submission = one campaign.
CREATE TABLE IF NOT EXISTS campaigns (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject            TEXT NOT NULL,
  body               TEXT NOT NULL,
  start_at           TIMESTAMPTZ NOT NULL,
  delay_ms           INT NOT NULL,
  hourly_limit       INT NOT NULL,
  total              INT NOT NULL,
  -- Idempotency-Key header from the client: a retried POST returns the same campaign
  client_request_id  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id)
);

-- One row per recipient. The database, not Redis, is the source of truth.
CREATE TABLE IF NOT EXISTS emails (
  id                  BIGSERIAL PRIMARY KEY,
  campaign_id         BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id           INT NOT NULL REFERENCES senders(id),
  to_email            TEXT NOT NULL,
  subject             TEXT NOT NULL,
  body                TEXT NOT NULL,
  scheduled_at        TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'sending', 'sent', 'failed')),
  attempts            INT NOT NULL DEFAULT 0,
  locked_at           TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  message_id          TEXT,
  preview_url         TEXT,
  last_error          TEXT,
  rate_limited_count  INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The same address can never be queued twice inside one campaign
  UNIQUE (campaign_id, to_email)
);

CREATE INDEX IF NOT EXISTS idx_emails_user_status_sched ON emails (user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_emails_status_sched      ON emails (status, scheduled_at);

-- Per-user Slack connection (from the OAuth flow).
CREATE TABLE IF NOT EXISTS slack_connections (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_id       TEXT,
  team_name     TEXT,
  channel       TEXT,
  channel_id    TEXT,
  webhook_url   TEXT NOT NULL,
  access_token  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
