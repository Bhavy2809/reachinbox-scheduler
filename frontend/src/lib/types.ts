export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';
export type Tab = 'scheduled' | 'sent';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface EmailItem {
  id: string;
  campaignId: string;
  to: string;
  subject: string;
  /** Plain-text snippet of the body for the inbox row. */
  preview: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  senderId: number;
  previewUrl: string | null;
  /** True when the host blocks SMTP and the send was simulated (SMTP_SIMULATE=true). */
  simulated: boolean;
  error: string | null;
  attempts: number;
  rateLimitedCount: number;
}

export interface EmailDetail extends EmailItem {
  body: string; // HTML
  fromName: string | null;
  fromAddress: string | null;
}

export interface EmailPage {
  items: EmailItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchResponse {
  items: EmailItem[];
  backend: 'elasticsearch' | 'sql';
}

export interface ScheduleRequest {
  subject: string;
  body: string; // HTML from the editor
  recipients: string[];
  startTime: string; // ISO
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  campaignId: string;
  scheduled: number;
  duplicatesRemoved: number;
  replayed: boolean;
  startAt: string;
}

export interface SenderUsage {
  senderId: number;
  address: string;
  sentThisHour: number;
  limit: number;
}

export interface Stats {
  counts: Record<EmailStatus, number>;
  senders: SenderUsage[];
  settings: { minDelayBetweenSendsMs: number; maxEmailsPerHourPerSender: number; concurrency: number };
  searchBackend: 'elasticsearch' | 'sql';
  smtpMode: 'ethereal' | 'simulated';
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  team: string | null;
  channel: string | null;
}
