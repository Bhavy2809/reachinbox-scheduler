'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftIcon, ChevronDownIcon, ClipIcon, ClockIcon } from '@/components/Icons';
import { RecipientInput } from '@/components/RecipientInput';
import { RichTextEditor } from '@/components/RichTextEditor';
import { SendLaterPopover } from '@/components/SendLaterPopover';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { htmlIsEmpty } from '@/lib/format';
import type { Stats } from '@/lib/types';

type Errors = Partial<Record<'to' | 'subject' | 'body' | 'delay' | 'limit', string>>;

/** One labelled row of the compose form (label column + content), as in the Figma. */
function Row({ label, children, border = true }: { label: string; children: ReactNode; border?: boolean }) {
  return (
    <div className={`flex items-start gap-4 py-3 ${border ? 'border-b border-gray-100' : ''}`}>
      <span className="w-14 shrink-0 pt-1 text-xs text-gray-600">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SmallNumber({ value, onChange, error, label }: { value: string; onChange: (v: string) => void; error?: string; label: string }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={value}
      placeholder="00"
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      className={`h-8 w-14 rounded-md border bg-white px-2 text-center text-xs text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-200 ${
        error ? 'border-red-300' : 'border-gray-200'
      }`}
    />
  );
}

export default function ComposePage() {
  const router = useRouter();
  const toast = useToast();
  const { user, checking } = useAuth();

  const [stats, setStats] = useState<Stats | null>(null);
  const [fromOpen, setFromOpen] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delay, setDelay] = useState('');
  const [limit, setLimit] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // One key per compose session: a double click or retried request can't create two campaigns.
  const idempotencyKey = useRef('');
  const fromRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    if (user) api.stats().then(setStats).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (!fromOpen) return;
    const close = (e: MouseEvent) => !fromRef.current?.contains(e.target as Node) && setFromOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [fromOpen]);

  const closePopover = useCallback(() => setPopoverOpen(false), []);

  function validate(): boolean {
    const e: Errors = {};
    if (recipients.length === 0) e.to = 'Add at least one recipient or upload a list';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (htmlIsEmpty(body)) e.body = 'Write the email body';
    const d = Number(delay || '0');
    if (!Number.isFinite(d) || d < 0) e.delay = 'Invalid delay';
    const l = Number(limit);
    if (!limit || !Number.isInteger(l) || l < 1) e.limit = 'Hourly limit must be at least 1';
    setErrors(e);
    if (Object.keys(e).length) toast('error', Object.values(e)[0] as string);
    return Object.keys(e).length === 0;
  }

  function openSendLater() {
    if (validate()) setPopoverOpen(true);
  }

  async function schedule(when: Date) {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.schedule(
        {
          subject: subject.trim(),
          body,
          recipients,
          startTime: when.toISOString(),
          delayBetweenEmailsMs: Math.round(Number(delay || '0') * 1000),
          hourlyLimit: Number(limit),
        },
        idempotencyKey.current,
      );
      toast('success', `Scheduled ${res.scheduled} email${res.scheduled === 1 ? '' : 's'}`);
      router.push('/dashboard?tab=scheduled');
    } catch (err) {
      toast('error', (err as Error).message);
      setSubmitting(false);
    }
  }

  if (checking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <Spinner />
      </div>
    );
  }

  const senders = stats?.senders ?? [];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-white px-5 py-3.5">
        <button onClick={() => router.push('/dashboard')} className="rounded-lg p-1.5 text-gray-700 hover:bg-surface-100" aria-label="Back">
          <ArrowLeftIcon width={18} height={18} />
        </button>
        <h1 className="flex-1 text-lg font-medium text-gray-900">Compose New Email</h1>

        <button disabled title="Attachments are not part of this assignment" className="cursor-not-allowed rounded-lg p-2 text-gray-300" aria-label="Attach">
          <ClipIcon width={17} height={17} />
        </button>
        <div className="relative flex items-center gap-2">
          <button onClick={openSendLater} className="rounded-lg p-2 text-gray-500 hover:bg-surface-100 hover:text-gray-800" aria-label="Schedule">
            <ClockIcon width={17} height={17} />
          </button>
          <button
            onClick={openSendLater}
            disabled={submitting}
            className="h-8 rounded-full border border-brand-600 px-4 text-xs font-medium text-brand-600 transition hover:bg-brand-50 disabled:opacity-60"
          >
            Send Later
          </button>
          <SendLaterPopover open={popoverOpen} onClose={closePopover} onDone={(w) => void schedule(w)} busy={submitting} />
        </div>
      </header>

      {/* Form */}
      <div className="mx-auto max-w-[760px] px-6 pb-16">
        <Row label="From">
          <div ref={fromRef} className="relative inline-block">
            <button
              type="button"
              onClick={() => setFromOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-100 px-2.5 py-1 text-xs text-gray-800 hover:bg-surface-200"
            >
              {senders.length ? `${senders.length} Ethereal senders · round-robin` : 'Ethereal senders'}
              <ChevronDownIcon width={12} height={12} className="text-gray-400" />
            </button>
            {fromOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-gray-100 bg-white p-2 shadow-pop">
                <p className="px-2 pb-1 text-2xs text-gray-400">Emails rotate across these accounts; each has its own hourly limit.</p>
                {senders.map((s) => (
                  <div key={s.senderId} className="flex justify-between rounded-md px-2 py-1.5 text-xs text-gray-700">
                    <span className="truncate">{s.address}</span>
                    <span className="ml-2 shrink-0 text-gray-400">
                      {s.sentThisHour}/{s.limit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Row>

        <Row label="To">
          <RecipientInput value={recipients} onChange={setRecipients} onNotice={toast} error={errors.to} />
        </Row>

        <Row label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            maxLength={500}
            className={`h-7 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none ${errors.subject ? 'placeholder:text-red-300' : ''}`}
          />
        </Row>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4">
          <label className="flex items-center gap-3 text-xs text-gray-600">
            Delay between 2 emails
            <SmallNumber label="Delay between emails in seconds" value={delay} onChange={setDelay} error={errors.delay} />
            <span className="-ml-1 text-2xs text-gray-400">sec</span>
          </label>
          <label className="flex items-center gap-3 text-xs text-gray-600">
            Hourly Limit
            <SmallNumber label="Hourly limit" value={limit} onChange={setLimit} error={errors.limit} />
          </label>
          {recipients.length > 1 && Number(limit) > 0 && (
            <span className="text-2xs text-gray-400">
              {recipients.length > Number(limit)
                ? `${recipients.length - Number(limit)} will roll over into later hours`
                : `All ${recipients.length} fit in the first hour`}
            </span>
          )}
        </div>

        <RichTextEditor value={body} onChange={setBody} error={errors.body} />
      </div>
    </div>
  );
}
