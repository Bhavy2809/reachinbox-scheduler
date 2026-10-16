'use client';

import { useState } from 'react';
import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

export function SlackCard() {
  const toast = useToast();
  const { data, loading, refresh } = usePolling(api.slackStatus, [], 30_000);
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await api.slackDisconnect();
      toast('info', 'Slack disconnected');
      await refresh();
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await api.slackTest();
      toast('success', 'Test message sent to Slack');
    } catch {
      toast('error', 'Slack did not accept the message - try reconnecting');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5" viewBox="0 0 54 54" aria-hidden>
          <path fill="#36C5F0" d="M19.7 0a5.4 5.4 0 100 10.8h5.4V5.4A5.4 5.4 0 0019.7 0zm0 14.4H5.4a5.4 5.4 0 100 10.8h14.3a5.4 5.4 0 100-10.8z" />
          <path fill="#2EB67D" d="M54 19.8a5.4 5.4 0 10-10.8 0v5.4h5.4a5.4 5.4 0 005.4-5.4zm-14.4 0V5.4a5.4 5.4 0 10-10.8 0v14.4a5.4 5.4 0 1010.8 0z" />
          <path fill="#ECB22E" d="M34.2 54a5.4 5.4 0 100-10.8h-5.4v5.4a5.4 5.4 0 005.4 5.4zm0-14.4h14.4a5.4 5.4 0 100-10.8H34.2a5.4 5.4 0 100 10.8z" />
          <path fill="#E01E5A" d="M0 34.2a5.4 5.4 0 1010.8 0v-5.4H5.4A5.4 5.4 0 000 34.2zm14.4 0v14.4a5.4 5.4 0 1010.8 0V34.2a5.4 5.4 0 10-10.8 0z" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900">Slack alerts</h3>
      </div>
      <p className="mt-1 text-xs text-gray-500">Get a message the moment a sender hits its hourly limit.</p>

      <div className="mt-3">
        {loading ? (
          <p className="text-xs text-gray-400">Checking...</p>
        ) : data?.connected ? (
          <>
            <p className="text-xs text-gray-700">
              Connected to <span className="font-medium">{data.team}</span> · {data.channel}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={test} disabled={busy}>
                Send test
              </Button>
              <Button size="sm" variant="danger" onClick={disconnect} disabled={busy}>
                Disconnect
              </Button>
            </div>
          </>
        ) : data && !data.configured ? (
          <p className="text-xs text-amber-700">Server is missing SLACK_CLIENT_ID / SLACK_CLIENT_SECRET.</p>
        ) : (
          <a
            href={api.slackConnectUrl}
            className="inline-flex items-center rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Connect Slack
          </a>
        )}
      </div>
    </div>
  );
}
