'use client';

import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import { parseLeads } from '@/lib/leads';
import { UploadIcon, XIcon } from './Icons';

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX = 5000;
const COLLAPSED_CHIPS = 3;

interface Props {
  value: string[];
  onChange: (emails: string[]) => void;
  onNotice: (kind: 'success' | 'error' | 'info', msg: string) => void;
  error?: string;
}

/** "To" field: type/paste addresses as chips, or upload a CSV/text list of leads. */
export function RecipientInput({ value, onChange, onNotice, error }: Props) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function add(candidates: string[]): number {
    const seen = new Set(value);
    const next = [...value];
    let added = 0;
    for (const raw of candidates) {
      const e = raw.trim().toLowerCase();
      if (!EMAIL.test(e) || seen.has(e) || next.length >= MAX) continue;
      seen.add(e);
      next.push(e);
      added++;
    }
    if (added) onChange(next);
    return added;
  }

  function commitDraft() {
    if (!draft.trim()) return;
    if (add(draft.split(/[\s,;]+/)) === 0 && !value.includes(draft.trim().toLowerCase())) {
      onNotice('error', `"${draft.trim()}" is not a valid email address`);
    }
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (['Enter', ',', ';', ' ', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (/[\s,;]/.test(text)) {
      e.preventDefault();
      const n = add(parseLeads(text).emails);
      onNotice('info', `Added ${n} email${n === 1 ? '' : 's'} from clipboard`);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return onNotice('error', 'File is larger than 5 MB');
    const { emails, duplicates } = parseLeads(await file.text());
    if (emails.length === 0) return onNotice('error', `No email addresses found in ${file.name}`);
    const before = value.length;
    const n = add(emails);
    const skipped = emails.length - n;
    onNotice(
      'success',
      `${file.name}: ${emails.length} email${emails.length === 1 ? '' : 's'} detected, ${n} added` +
        (duplicates + skipped > 0 ? ` · ${duplicates + skipped} duplicate${duplicates + skipped === 1 ? '' : 's'} removed` : '') +
        (before + n >= MAX ? ` (max ${MAX})` : ''),
    );
  }

  const visible = expanded ? value : value.slice(0, COLLAPSED_CHIPS);
  const hidden = value.length - visible.length;

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex min-h-[28px] flex-1 flex-wrap items-center gap-1.5">
          {visible.map((email) => (
            <span key={email} className="inline-flex items-center gap-1 rounded-full border border-brand-500 bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs text-gray-800">
              {email}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== email))}
                className="rounded-full p-0.5 text-gray-400 hover:bg-brand-100 hover:text-gray-700"
                aria-label={`Remove ${email}`}
              >
                <XIcon width={10} height={10} />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="rounded-full border border-brand-500 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              +{hidden}
            </button>
          )}
          {expanded && value.length > COLLAPSED_CHIPS && (
            <button type="button" onClick={() => setExpanded(false)} className="px-1 text-2xs text-gray-400 hover:text-gray-600">
              show less
            </button>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commitDraft}
            onPaste={onPaste}
            placeholder={value.length ? '' : 'recipient@example.com'}
            className="h-7 min-w-[180px] flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex shrink-0 items-center gap-1.5 pt-1 text-xs font-medium text-brand-600 hover:text-brand-700">
          <UploadIcon width={14} height={14} /> Upload List
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
      </div>
      {(value.length > 0 || error) && (
        <p className={`mt-1 text-2xs ${error ? 'text-red-600' : 'text-gray-400'}`}>
          {error ?? `${value.length} recipient${value.length === 1 ? '' : 's'}`}
        </p>
      )}
    </div>
  );
}
