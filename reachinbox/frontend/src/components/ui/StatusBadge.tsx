import type { EmailStatus } from '@/lib/types';

const STYLES: Record<EmailStatus, string> = {
  scheduled: 'bg-amber-50 text-amber-700 ring-amber-200',
  sending: 'bg-blue-50 text-blue-700 ring-blue-200',
  sent: 'bg-brand-50 text-brand-700 ring-brand-100',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};

export function StatusBadge({ status, note }: { status: EmailStatus; note?: string }) {
  return (
    <span
      title={note}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STYLES[status]}`}
    >
      {status === 'sending' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />}
      {status}
    </span>
  );
}
