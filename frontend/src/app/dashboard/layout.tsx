'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { DashboardContext } from '@/components/DashboardContext';
import { Sidebar } from '@/components/Sidebar';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import type { Tab } from '@/lib/types';

function Shell({ children }: { children: ReactNode }) {
  const { user, checking, logout } = useAuth();
  const params = useSearchParams();
  const tab: Tab = params.get('tab') === 'sent' ? 'sent' : 'scheduled';

  const ready = Boolean(user);
  const stats = usePolling(() => (ready ? api.stats() : Promise.resolve(null)), [ready], 5000);

  if (checking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        <Spinner />
      </div>
    );
  }

  return (
    <DashboardContext.Provider value={{ user, stats: stats.data, refreshStats: stats.refresh, logout }}>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar activeTab={tab} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </DashboardContext.Provider>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
