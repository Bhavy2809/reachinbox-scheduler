import type { Stats } from '@/lib/types';

/** Live view of each sender's hourly counter (read from the same Redis keys the worker uses). */
export function SenderUsage({ stats }: { stats: Stats | null }) {
  if (!stats) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Senders this hour</h3>
      <p className="mt-1 text-xs text-gray-500">
        Min {stats.settings.minDelayBetweenSendsMs / 1000}s between sends · concurrency {stats.settings.concurrency}
      </p>
      <ul className="mt-3 space-y-3">
        {stats.senders.map((s) => {
          const pct = Math.min(100, Math.round((s.sentThisHour / s.limit) * 100));
          return (
            <li key={s.senderId}>
              <div className="flex justify-between text-xs">
                <span className="truncate text-gray-600" title={s.address}>
                  #{s.senderId} {s.address}
                </span>
                <span className="ml-2 shrink-0 font-medium text-gray-900">
                  {s.sentThisHour}/{s.limit}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
