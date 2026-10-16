'use client';

import { createContext, useContext } from 'react';
import type { Stats, User } from '@/lib/types';

export interface DashboardState {
  user: User;
  stats: Stats | null;
  refreshStats: () => Promise<void>;
  logout: () => Promise<void>;
}

export const DashboardContext = createContext<DashboardState | null>(null);

/** Logged-in user + live counts, shared by the sidebar and the inbox list. */
export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside the dashboard layout');
  return ctx;
}
