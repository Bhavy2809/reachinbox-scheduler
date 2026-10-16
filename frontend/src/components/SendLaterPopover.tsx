'use client';

import { useEffect, useRef, useState } from 'react';
import { toLocalInputValue } from '@/lib/format';
import { CalendarIcon } from './Icons';

interface Preset {
  label: string;
  at: () => Date;
}

function tomorrowAt(h: number, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}

const PRESETS: Preset[] = [
  { label: 'In 1 minute', at: () => new Date(Date.now() + 60_000) },
  { label: 'Tomorrow', at: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (when: Date) => void;
  busy?: boolean;
}

/** "Send Later" panel from the Figma: pick a date/time or a preset, then Done schedules the campaign. */
export function SendLaterPopover({ open, onClose, onDone, busy }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [preset, setPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Defer so the click that opened the popover doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  if (!open) return null;

  function done() {
    if (!value) return setError('Pick a date & time or a preset');
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return setError('Invalid date');
    // A minute or two in the past (slow click) is fine - the backend treats it as "now".
    if (when.getTime() < Date.now() - 2 * 60_000) return setError('That time is in the past');
    onDone(when);
  }

  return (
    <div ref={ref} className="absolute right-0 top-full z-40 mt-2 w-[290px] rounded-xl border border-gray-100 bg-white p-4 shadow-pop">
      <h3 className="text-sm font-semibold text-gray-900">Send Later</h3>

      <p className="mt-3 text-2xs text-gray-500">Pick date &amp; time</p>
      <label className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 focus-within:border-brand-500">
        <CalendarIcon className="pointer-events-none shrink-0 text-gray-400" width={14} height={14} />
        <input
          type="datetime-local"
          value={value}
          min={toLocalInputValue(new Date())}
          onChange={(e) => {
            setValue(e.target.value);
            setPreset(null);
            setError(null);
          }}
          className="h-full flex-1 bg-transparent text-xs text-gray-800 focus:outline-none"
          aria-label="Pick date & time"
        />
      </label>

      <ul className="mt-3 space-y-0.5">
        {PRESETS.map((p) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => {
                setValue(toLocalInputValue(p.at()));
                setPreset(p.label);
                setError(null);
              }}
              className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition ${
                preset === p.label ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-700 hover:bg-surface-100'
              }`}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="mt-2 text-2xs text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900">
          Cancel
        </button>
        <button
          type="button"
          onClick={done}
          disabled={busy}
          className="rounded-full border border-brand-600 px-4 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-50 disabled:opacity-60"
        >
          {busy ? 'Scheduling…' : 'Done'}
        </button>
      </div>
    </div>
  );
}
