'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

/** Loads the logged-in user; sends the browser back to the login page if the session is missing. */
export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(({ user }) => !cancelled && setUser(user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace('/');
        else router.replace('/?error=backend_unreachable');
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    router.replace('/');
  };

  return { user, checking, logout };
}
