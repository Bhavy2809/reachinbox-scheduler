'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { StatusPill } from '@/components/EmailRow';
import { ArchiveIcon, ArrowLeftIcon, ExternalIcon, StarIcon, TrashIcon } from '@/components/Icons';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api';
import { longDateTime, relativeTime } from '@/lib/format';
import { bodyToSafeHtml } from '@/lib/sanitize';
import type { EmailDetail } from '@/lib/types';

export default function EmailDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, checking } = useAuth();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () =>
      api
        .getEmail(id)
        .then((e) => !cancelled && setEmail(e))
        .catch((err) => !cancelled && setError(err instanceof ApiError && err.status === 404 ? 'This email does not exist.' : (err as Error).message));
    void load();
    // Keep the status fresh while it is still waiting to be sent.
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, user]);

  const html = useMemo(() => (email ? bodyToSafeHtml(email.body) : ''), [email]);

  const back = () => (window.history.length > 1 ? router.back() : router.push('/dashboard'));

  if (checking || !user || (!email && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <Spinner />
      </div>
    );
  }

  const when = email?.sentAt ?? email?.scheduledAt ?? null;
  const fromName = email?.fromName ?? 'ReachInbox';

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-3.5">
        <button onClick={back} className="rounded-lg p-1.5 text-gray-700 hover:bg-surface-100" aria-label="Back">
          <ArrowLeftIcon width={18} height={18} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium text-gray-900">
          {email ? (
            <>
              {email.subject} <span className="text-gray-300">|</span> <span className="text-gray-500">#{email.id}</span>
            </>
          ) : (
            'Email'
          )}
        </h1>
        <div className="flex items-center gap-1 text-gray-400">
          <button onClick={() => setStarred((s) => !s)} className={`rounded-lg p-2 hover:bg-surface-100 ${starred ? 'text-amber-400' : ''}`} aria-label="Star">
            <StarIcon filled={starred} />
          </button>
          <button disabled title="Not available in this demo" className="cursor-not-allowed rounded-lg p-2 opacity-60" aria-label="Archive">
            <ArchiveIcon />
          </button>
          <button disabled title="Not available in this demo" className="cursor-not-allowed rounded-lg p-2 opacity-60" aria-label="Delete">
            <TrashIcon />
          </button>
          <span className="mx-2 h-6 w-px bg-gray-200" />
          <Avatar name={user.name} email={user.email} src={user.avatarUrl} size={30} />
        </div>
      </header>

      {error ? (
        <p className="mx-auto mt-10 max-w-3xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : (
        email && (
          <article className="mx-auto max-w-3xl px-6 py-6">
            {/* Sender block */}
            <div className="flex items-start gap-3">
              <Avatar name={fromName} email={email.fromAddress ?? 'r@x'} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-semibold text-gray-900">{fromName}</span>{' '}
                  <span className="text-xs text-gray-500">&lt;{email.fromAddress ?? 'unknown sender'}&gt;</span>
                </p>
                <p className="text-xs text-gray-500">to {email.to}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-500">{longDateTime(when)}</p>
                <p className="text-2xs text-gray-400">{relativeTime(when)}</p>
              </div>
            </div>

            {/* Delivery status */}
            <div className="ml-12 mt-4 flex flex-wrap items-center gap-2 text-xs">
              <StatusPill email={email} />
              {email.status === 'scheduled' && email.rateLimitedCount > 0 && (
                <span className="text-amber-700">Held back by the hourly limit {email.rateLimitedCount}× - still queued, not dropped.</span>
              )}
              {email.status === 'failed' && email.error && <span className="text-red-600">{email.error}</span>}
              {email.simulated && (
                <span className="text-gray-500">
                  Delivery simulated - the hosting provider blocks outbound SMTP. Locally this goes through Ethereal.
                </span>
              )}
              {email.previewUrl && (
                <a href={email.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                  View delivered message on Ethereal <ExternalIcon width={12} height={12} />
                </a>
              )}
            </div>

            {/* Body */}
            <div className="email-body ml-12 mt-6 text-sm leading-relaxed text-gray-800" dangerouslySetInnerHTML={{ __html: html }} />
          </article>
        )
      )}
    </div>
  );
}
