import type {
  EmailDetail,
  EmailPage,
  ScheduleRequest,
  ScheduleResponse,
  SearchResponse,
  SlackStatus,
  Stats,
  Tab,
  User,
} from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Every call sends the session cookie (credentials: 'include') and returns typed JSON. */
type RequestOptions = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  /** Full-page navigations (OAuth needs real redirects, not fetch). */
  googleLoginUrl: `${API_URL}/auth/google`,
  slackConnectUrl: `${API_URL}/api/slack/connect`,
  queueDashboardUrl: `${API_URL}/admin/queues`,

  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  listEmails: (tab: Tab, page = 1, pageSize = 20) =>
    request<EmailPage>(`/api/emails?tab=${tab}&page=${page}&pageSize=${pageSize}`),
  getEmail: (id: string) => request<EmailDetail>(`/api/emails/${encodeURIComponent(id)}`),
  search: (q: string) => request<SearchResponse>(`/api/emails/search?q=${encodeURIComponent(q)}`),
  stats: () => request<Stats>('/api/emails/stats'),
  schedule: (body: ScheduleRequest, idempotencyKey: string) =>
    request<ScheduleResponse>('/api/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  slackStatus: () => request<SlackStatus>('/api/slack/status'),
  slackTest: () => request<{ ok: boolean }>('/api/slack/test', { method: 'POST' }),
  slackDisconnect: () => request<{ ok: boolean }>('/api/slack', { method: 'DELETE' }),
};
