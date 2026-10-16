'use client';

import type { ReactNode } from 'react';
import { formatDateTime, relativeTime } from '@/lib/format';
import type { EmailItem, Tab } from '@/lib/types';
import { EmptyState } from './ui/EmptyState';
import { Spinner } from './ui/Spinner';
import { StatusBadge } from './ui/StatusBadge';

interface Props {
  tab: Tab;
  items: EmailItem[];
  loading: boolean;
  error: string | null;
  emptyAction?: ReactNode;
}

/** One table for both tabs - only the time column and the empty text differ. */
export function EmailTable({ tab, items, loading, error, emptyAction }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm text-gray-500">
        <Spinner /> Loading emails...
      </div>
    );
  }
  if (error) {
    return <p className="m-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Could not load emails: {error}</p>;
  }
  if (items.length === 0) {
    return tab === 'scheduled' ? (
      <EmptyState title="No scheduled emails" description="Compose a new email and upload a list of leads to schedule your first send." action={emptyAction} />
    ) : (
      <EmptyState title="Nothing sent yet" description="Sent and failed emails show up here as soon as the worker processes them." />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-6 py-3">Email</th>
            <th className="px-6 py-3">Subject</th>
            <th className="px-6 py-3">{tab === 'scheduled' ? 'Scheduled time' : 'Sent time'}</th>
            <th className="px-6 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {items.map((e) => {
            const time = tab === 'scheduled' ? e.scheduledAt : e.sentAt;
            return (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-3 font-medium text-gray-900">{e.to}</td>
                <td className="max-w-xs truncate px-6 py-3 text-gray-700" title={e.subject}>
                  {e.subject}
                </td>
                <td className="whitespace-nowrap px-6 py-3 text-gray-700">
                  {formatDateTime(time)}
                  <span className="ml-2 text-xs text-gray-400">{relativeTime(time)}</span>
                </td>
                <td className="whitespace-nowrap px-6 py-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={e.status} note={e.error ?? undefined} />
                    {e.rateLimitedCount > 0 && e.status !== 'sent' && (
                      <span className="text-xs text-amber-600" title="Pushed to a later hour by the hourly limit">
                        rate-limited
                      </span>
                    )}
                    {e.previewUrl && (
                      <a href={e.previewUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                        preview
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
