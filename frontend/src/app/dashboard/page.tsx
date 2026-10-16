'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ComposeModal } from '@/components/ComposeModal';
import { EmailTable } from '@/components/EmailTable';
import { Header } from '@/components/Header';
import { SenderUsage } from '@/components/SenderUsage';
import { SlackCard } from '@/components/SlackCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import type { EmailItem, Tab } from '@/lib/types';

const PAGE_SIZE = 20;

const SLACK_MESSAGES: Record<string, ['success' | 'error', string]> = {
  connected: ['success', 'Slack connected - rate-limit alerts are on'],
  denied: ['error', 'Slack connection was cancelled'],
  invalid_state: ['error', 'Slack connection expired, please try again'],
  user_mismatch: ['error', 'Slack connection belongs to another user'],
  error: ['error', 'Slack connection failed'],
};

function Dashboard() {
  const { user, checking, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();

  const [tab, setTab] = useState<Tab>('scheduled');
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Show the result of the Slack OAuth redirect once, then clean the URL.
  useEffect(() => {
    const slack = params.get('slack');
    if (slack && SLACK_MESSAGES[slack]) {
      toast(...SLACK_MESSAGES[slack]);
      router.replace('/dashboard');
    }
  }, [params, router, toast]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const ready = Boolean(user);
  const emails = usePolling(() => (ready ? api.listEmails(tab, page, PAGE_SIZE) : Promise.resolve(null)), [tab, page, ready]);
  const stats = usePolling(() => (ready ? api.stats() : Promise.resolve(null)), [ready], 5000);
  const search = usePolling(
    () => (ready && debounced ? api.search(debounced) : Promise.resolve(null)),
    [debounced, ready],
    10_000,
  );

  if (checking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        <Spinner />
      </div>
    );
  }

  const counts = stats.data?.counts;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'scheduled', label: 'Scheduled Emails', count: counts ? counts.scheduled + counts.sending : undefined },
    { key: 'sent', label: 'Sent Emails', count: counts ? counts.sent + counts.failed : undefined },
  ];

  const searching = debounced.length > 0;
  const items: EmailItem[] = searching ? search.data?.items ?? [] : emails.data?.items ?? [];
  const totalPages = emails.data ? Math.max(1, Math.ceil(emails.data.total / PAGE_SIZE)) : 1;

  const refreshAll = () => {
    void emails.refresh();
    void stats.refresh();
  };

  return (
    <div className="min-h-screen">
      <Header user={user} onLogout={logout} />

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_300px]">
        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Email scheduler</h1>
              <p className="text-sm text-gray-500">Updates live as the worker sends.</p>
            </div>
            <Button
              onClick={() => setComposeOpen(true)}
              icon={
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
              }
            >
              Compose New Email
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-4 pt-3 sm:flex-row sm:items-end sm:justify-between">
              <nav className="flex gap-6" aria-label="Tabs">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key);
                      setPage(1);
                      setQuery('');
                    }}
                    className={`-mb-px border-b-2 pb-3 text-sm font-medium ${
                      tab === t.key && !searching
                        ? 'border-brand-600 text-brand-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t.label}
                    {t.count !== undefined && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t.count}</span>
                    )}
                  </button>
                ))}
              </nav>
              <div className="pb-3 sm:w-64">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search email, subject, body..." />
              </div>
            </div>

            {searching && (
              <p className="border-b border-gray-100 bg-gray-50 px-6 py-2 text-xs text-gray-500">
                {search.loading ? 'Searching...' : `${items.length} result${items.length === 1 ? '' : 's'} for "${debounced}"`}
                {search.data && ` · via ${search.data.backend === 'elasticsearch' ? 'Elasticsearch' : 'SQL fallback'}`}
              </p>
            )}

            <EmailTable
              tab={searching ? 'scheduled' : tab}
              items={items}
              loading={searching ? search.loading : emails.loading}
              error={searching ? search.error : emails.error}
              emptyAction={
                <Button variant="secondary" onClick={() => setComposeOpen(true)}>
                  Compose New Email
                </Button>
              }
            />

            {!searching && emails.data && emails.data.total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3 text-sm text-gray-600">
                <span>
                  Page {page} of {totalPages} · {emails.data.total} emails
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <SenderUsage stats={stats.data} />
          <SlackCard />
          <a
            href={api.queueDashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-500"
          >
            <h3 className="text-sm font-semibold text-gray-900">Queue dashboard ↗</h3>
            <p className="mt-1 text-xs text-gray-500">Live BullMQ view: delayed, active, completed and failed jobs.</p>
          </a>
        </aside>
      </main>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} onScheduled={refreshAll} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
