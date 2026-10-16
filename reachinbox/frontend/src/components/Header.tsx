'use client';

import { useState } from 'react';
import { initials } from '@/lib/format';
import type { User } from '@/lib/types';

export function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">R</div>
          <span className="font-semibold">ReachInbox</span>
          <span className="ml-2 hidden rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500 sm:inline">Scheduler</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-gray-900">{user.name ?? user.email}</p>
            <p className="text-xs leading-tight text-gray-500">{user.email}</p>
          </div>
          {user.avatarUrl && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={user.name ?? 'avatar'}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="h-9 w-9 rounded-full ring-1 ring-gray-200"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials(user.name, user.email)}
            </div>
          )}
          <button onClick={onLogout} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
