'use client';

import { useState } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { ExternalIcon } from './Icons';
import { useToast } from './ui/Toast';

function SlackLogo() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 54 54" aria-hidden>
      <path fill="#36C5F0" d="M19.7 0a5.4 5.4 0 100 10.8h5.4V5.4A5.4 5.4 0 0019.7 0zm0 14.4H5.4a5.4 5.4 0 100 10.8h14.3a5.4 5.4 0 100-10.8z" />
      <path fill="#2EB67D" d="M54 19.8a5.4 5.4 0 10-10.8 0v5.4h5.4a5.4 5.4 0 005.4-5.4zm-14.4 0V5.4a5.4 5.4 0 10-10.8 0v14.4a5.4 5.4 0 1010.8 0z" />
      <path fill="#ECB22E" d="M34.2 54a5.4 5.4 0 100-10.8h-5.4v5.4a5.4 5.4 0 005.4 5.4zm0-14.4h14.4a5.4 5.4 0 100-10.8H34.2a5.4 5.4 0 100 10.8z" />
      <path fill="#E01E5A" d="M0 34.2a5.4 5.4 0 1010.8 0v-5.4H5.4A5.4 5.4 0 000 34.2zm14.4 0v14.4a5.4 5.4 0 1010.8 0V34.2a5.4 5.4 0 10-10.8 0z" />
    </svg>
  );
}

/** Compact Slack connection card for the sidebar: connect / test / disconnect. */
export function SlackCard() {
  const toast = useToast();
  const { data, loading, refresh } = usePolling(api.slackStatus, [], 30_000);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string, fail: string) {
    setBusy(true);
    try {
      await fn();
      toast('success', ok);
    } catch {
      toast('error', fail);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-surface-50 p-3">
      <div className="flex items-center gap-2">
        <SlackLogo />
        <span className="text-sm font-medium text-gray-900">Slack alerts</span>
        {data?.connected && <span className="ml-auto h-2 w-2 rounded-full bg-brand-500" title="Connected" />}
      </div>

      {loading ? (
        <p className="mt-2 text-2xs text-gray-400">Checking…</p>
      ) : data?.connected ? (
        <>
          <p className="mt-1.5 truncate text-2xs text-gray-500" title={`${data.team} · ${data.channel}`}>
            {data.team} · {data.channel}
          </p>
          <div className="mt-2 flex gap-3 text-2xs font-medium">
            <button disabled={busy} onClick={() => run(api.slackTest, 'Test message sent to Slack', 'Slack rejected the message')} className="text-brand-600 hover:underline disabled:opacity-50">
              Send test
            </button>
            <button disabled={busy} onClick={() => run(api.slackDisconnect, 'Slack disconnected', 'Could not disconnect')} className="text-red-600 hover:underline disabled:opacity-50">
              Disconnect
            </button>
          </div>
        </>
      ) : data && !data.configured ? (
        <p className="mt-1.5 text-2xs text-amber-700">Server is missing Slack credentials.</p>
      ) : (
        <a href={api.slackConnectUrl} className="mt-2 inline-flex items-center rounded-full bg-gray-900 px-3 py-1 text-2xs font-medium text-white hover:bg-gray-800">
          Connect Slack
        </a>
      )}

      <a href={api.queueDashboardUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 border-t border-gray-100 pt-2 text-2xs text-gray-500 hover:text-gray-800">
        Queue dashboard <ExternalIcon width={11} height={11} />
      </a>
    </div>
  );
}
