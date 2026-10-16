'use client';

import Link from 'next/link';
import { useState } from 'react';
import { badgeTime } from '@/lib/format';
import type { EmailItem } from '@/lib/types';
import { ClockIcon, StarIcon } from './Icons';

/** The pill before the subject: when it will go out, or what happened to it. */
export function StatusPill({ email }: { email: EmailItem }) {
  if (email.status === 'sent') {
    return (
      <span
        title={email.simulated ? 'Delivery simulated: this host blocks outbound SMTP' : undefined}
        className="shrink-0 rounded-full bg-surface-100 px-2 py-0.5 text-2xs font-medium text-gray-600"
      >
        {email.simulated ? 'Sent · simulated' : 'Sent'}
      </span>
    );
  }
  if (email.status === 'failed') {
    return (
      <span title={email.error ?? undefined} className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-2xs font-medium text-red-600 ring-1 ring-inset ring-red-100">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-2xs font-medium text-orange-600 ring-1 ring-inset ring-orange-200">
      {email.status === 'sending' ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
      ) : (
        <ClockIcon width={12} height={12} />
      )}
      {email.status === 'sending' ? 'Sending…' : badgeTime(email.scheduledAt)}
    </span>
  );
}

export function EmailRow({ email }: { email: EmailItem }) {
  // Starring is a client-side nicety from the design; not persisted.
  const [starred, setStarred] = useState(false);

  return (
    <li className="group relative flex items-center gap-4 border-b border-gray-100 px-4 py-3 transition hover:bg-surface-50">
      <Link href={`/email/${email.id}`} className="absolute inset-0" aria-label={`Open email to ${email.to}`} />
      <span className="w-[170px] shrink-0 truncate text-sm text-gray-900" title={email.to}>
        <span className="text-gray-500">To: </span>
        {email.to}
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <StatusPill email={email} />
        {email.rateLimitedCount > 0 && email.status !== 'sent' && (
          <span title="Moved to a later hour by the hourly limit" className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-700">
            Rate limited
          </span>
        )}
        <p className="min-w-0 truncate text-sm">
          <span className="font-medium text-gray-900">{email.subject}</span>
          {email.preview && <span className="text-gray-400"> - {email.preview}</span>}
        </p>
      </div>

      <button
        onClick={() => setStarred((s) => !s)}
        className={`relative z-10 shrink-0 rounded p-1 transition ${starred ? 'text-amber-400' : 'text-gray-300 hover:text-gray-500'}`}
        aria-label={starred ? 'Unstar' : 'Star'}
      >
        <StarIcon filled={starred} width={15} height={15} />
      </button>
    </li>
  );
}
