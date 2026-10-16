'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useDashboard } from '@/components/DashboardContext';
import { EmailRow } from '@/components/EmailRow';
import { FilterIcon, RefreshIcon, SearchIcon } from '@/components/Icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import type { EmailItem, Tab } from '@/lib/types';

const PAGE_SIZE = 50;

type Filter = 'all' | 'rate_limited' | 'sent' | 'failed';
const FILTERS: Record<Tab, { key: Filter; label: string }[]> = {
  scheduled: [
    { key: 'all', label: 'All scheduled' },
    { key: 'rate_limited', label: 'Rate limited only' },
  ],
  sent: [
    { key: 'all', label: 'All' },
    { key: 'sent', label: 'Sent' },
    { key: 'failed', label: 'Failed' },
  ],
};

const SLACK_MESSAGES: Record<string, ['success' | 'error', string]> = {
  connected: ['success', 'Slack connected - rate-limit alerts are on'],
  denied: ['error', 'Slack connection was cancelled'],
  invalid_state: ['error', 'Slack connection expired, please try again'],
  user_mismatch: ['error', 'Slack connection belongs to another user'],
  error: ['error', 'Slack connection failed'],
};

function applyFilter(items: EmailItem[], f: Filter) {
  if (f === 'rate_limited') return items.filter((e) => e.rateLimitedCount > 0);
  if (f === 'sent' || f === 'failed') return items.filter((e) => e.status === f);
  return items;
}

export default function InboxPage() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { refreshStats } = useDashboard();
  const tab: Tab = params.get('tab') === 'sent' ? 'sent' : 'scheduled';

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState<Filter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Show the result of the Slack OAuth redirect once, then clean the URL.
  useEffect(() => {
    const slack = params.get('slack');
    if (slack && SLACK_MESSAGES[slack]) {
      toast(...SLACK_MESSAGES[slack]);
      router.replace('/dashboard');
    }
  }, [params, router, toast]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
    setFilter('all');
  }, [tab]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => !filterRef.current?.contains(e.target as Node) && setFilterOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [filterOpen]);

  const list = usePolling(() => api.listEmails(tab, 1, limit), [tab, limit]);
  const search = usePolling(() => (debounced ? api.search(debounced) : Promise.resolve(null)), [debounced], 10_000);

  const searching = debounced.length > 0;
  const raw = searching ? search.data?.items ?? [] : list.data?.items ?? [];
  const items = applyFilter(raw, filter);
  const loading = searching ? search.loading : list.loading;
  const error = searching ? search.error : list.error;

  async function refresh() {
    setSpinning(true);
    await Promise.all([list.refresh(), search.refresh(), refreshStats()]);
    setTimeout(() => setSpinning(false), 400);
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-white px-4 pb-3 pt-4">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-full bg-surface-100 px-4 text-gray-400 focus-within:ring-2 focus-within:ring-brand-200">
          <SearchIcon width={15} height={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-full flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          {searching && search.data && (
            <span className="shrink-0 text-2xs text-gray-400">via {search.data.backend === 'elasticsearch' ? 'Elasticsearch' : 'SQL'}</span>
          )}
        </label>

        <div ref={filterRef} className="relative">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className={`rounded-lg p-2 transition hover:bg-surface-100 ${filter !== 'all' ? 'text-brand-600' : 'text-gray-500'}`}
            aria-label="Filter"
          >
            <FilterIcon />
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-pop">
              {FILTERS[tab].map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setFilter(f.key);
                    setFilterOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-surface-100 ${filter === f.key ? 'font-medium text-brand-700' : 'text-gray-700'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => void refresh()} className="rounded-lg p-2 text-gray-500 transition hover:bg-surface-100" aria-label="Refresh">
          <RefreshIcon className={spinning ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-sm text-gray-400">
          <Spinner /> Loading emails…
        </div>
      ) : error ? (
        <p className="m-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Could not load emails: {error}</p>
      ) : items.length === 0 ? (
        searching ? (
          <EmptyState title="No matches" description={`Nothing matches "${debounced}".`} />
        ) : tab === 'scheduled' ? (
          <EmptyState
            title="No scheduled emails"
            description={filter === 'all' ? 'Compose an email and upload a list of leads to schedule your first send.' : 'No emails are being held by the hourly limit.'}
            action={
              <Link href="/compose" className="inline-flex h-9 items-center rounded-full border border-brand-600 px-5 text-sm font-medium text-brand-600 hover:bg-brand-50">
                Compose
              </Link>
            }
          />
        ) : (
          <EmptyState title="Nothing sent yet" description="Sent and failed emails appear here as soon as the worker processes them." />
        )
      ) : (
        <>
          <ul className="px-2">
            {items.map((e) => (
              <EmailRow key={e.id} email={e} />
            ))}
          </ul>
          {!searching && list.data && list.data.total > limit && (
            <div className="flex justify-center py-5">
              <button onClick={() => setLimit((l) => l + PAGE_SIZE)} className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-surface-100">
                Load more ({list.data.total - limit} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
