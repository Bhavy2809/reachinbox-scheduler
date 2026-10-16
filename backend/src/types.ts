export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export interface UserRow {
  id: string; // BIGINT comes back from pg as string
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: Date;
}

export interface SenderRow {
  id: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
}

export interface CampaignRow {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  start_at: Date;
  delay_ms: number;
  hourly_limit: number;
  total: number;
  client_request_id: string | null;
  created_at: Date;
}

export interface EmailRow {
  id: string;
  campaign_id: string;
  user_id: string;
  sender_id: number;
  to_email: string;
  subject: string;
  body: string;
  scheduled_at: Date;
  status: EmailStatus;
  attempts: number;
  locked_at: Date | null;
  sent_at: Date | null;
  message_id: string | null;
  preview_url: string | null;
  last_error: string | null;
  rate_limited_count: number;
  created_at: Date;
  updated_at: Date;
}

/** Data stored on each BullMQ job. Kept tiny on purpose: the DB row is the source of truth. */
export interface EmailJobData {
  emailId: string;
  /** Send slot reserved for this job by the per-sender throttle (epoch ms). */
  reservedSlotAt?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
