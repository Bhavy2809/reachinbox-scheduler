'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load data once, then refresh every `intervalMs` so the tables update live as the worker sends.
 * `loading` is true only for the first load (and when deps change), not on background refreshes,
 * so the table doesn't flicker every few seconds.
 */
export function usePolling<T>(fetcher: () => Promise<T>, deps: unknown[], intervalMs = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, refresh]);

  return { data, error, loading, refresh };
}
