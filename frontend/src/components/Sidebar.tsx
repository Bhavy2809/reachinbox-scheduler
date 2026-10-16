'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tab } from '@/lib/types';
import { Avatar } from './Avatar';
import { useDashboard } from './DashboardContext';
import { ChevronDownIcon, ClockIcon, LogoutIcon, SendIcon } from './Icons';
import { SlackCard } from './SlackCard';

function UserMenu() {
  const { user, logout } = useDashboard();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl bg-surface-100 px-2.5 py-2 text-left transition hover:bg-surface-200"
      >
        <Avatar name={user.name} email={user.email} src={user.avatarUrl} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-gray-900">{user.name ?? user.email}</span>
          <span className="block truncate text-2xs leading-tight text-gray-500">{user.email}</span>
        </span>
        <ChevronDownIcon className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} width={14} height={14} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-pop">
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-surface-100"
          >
            <LogoutIcon width={15} height={15} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ tab, active, label, count, icon }: { tab: Tab; active: boolean; label: string; count?: number; icon: ReactNode }) {
  return (
    <Link
      href={`/dashboard?tab=${tab}`}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
        active ? 'bg-brand-50 font-medium text-gray-900' : 'text-gray-700 hover:bg-surface-100'
      }`}
    >
      <span className={active ? 'text-gray-900' : 'text-gray-500'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-2xs text-gray-500">{count}</span>}
    </Link>
  );
}

export function Sidebar({ activeTab }: { activeTab: Tab | null }) {
  const { stats } = useDashboard();
  const c = stats?.counts;

  return (
    <aside className="flex h-screen w-[232px] shrink-0 flex-col border-r border-gray-100 bg-white px-3 py-4">
      <Link href="/dashboard" className="mb-5 px-1.5 font-pixel text-[26px] font-bold leading-none tracking-wide text-gray-900">
        ONB
      </Link>

      <UserMenu />

      <Link
        href="/compose"
        className="mt-3 flex h-9 items-center justify-center rounded-full border border-brand-600 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
      >
        Compose
      </Link>

      <p className="mb-1 mt-6 px-2.5 text-2xs font-medium uppercase tracking-wide text-gray-400">Core</p>
      <nav className="space-y-0.5">
        <NavItem
          tab="scheduled"
          active={activeTab === 'scheduled'}
          label="Scheduled"
          count={c ? c.scheduled + c.sending : undefined}
          icon={<ClockIcon />}
        />
        <NavItem tab="sent" active={activeTab === 'sent'} label="Sent" count={c ? c.sent + c.failed : undefined} icon={<SendIcon />} />
      </nav>

      <div className="mt-auto space-y-3">
        {stats && (
          <div className="px-1">
            <p className="mb-2 px-1.5 text-2xs font-medium uppercase tracking-wide text-gray-400">Senders this hour</p>
            <ul className="space-y-2">
              {stats.senders.map((s) => {
                const pct = Math.min(100, Math.round((s.sentThisHour / s.limit) * 100));
                return (
                  <li key={s.senderId} className="px-1.5" title={s.address}>
                    <div className="flex justify-between text-2xs text-gray-500">
                      <span className="truncate">{s.address.split('@')[0]}</span>
                      <span className="ml-2 shrink-0 tabular-nums">
                        {s.sentThisHour}/{s.limit}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-200">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <SlackCard />
      </div>
    </aside>
  );
}
