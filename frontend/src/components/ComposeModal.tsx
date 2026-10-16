'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api } from '@/lib/api';
import { toLocalInputValue } from '@/lib/format';
import { parseLeads } from '@/lib/leads';
import { Button } from './ui/Button';
import { Field, Input, Textarea } from './ui/Field';
import { Modal } from './ui/Modal';
import { useToast } from './ui/Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

interface FormState {
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: string;
  hourlyLimit: string;
}

const initialForm = (): FormState => ({
  subject: '',
  body: '',
  startTime: toLocalInputValue(new Date(Date.now() + 60_000)),
  delaySeconds: '2',
  hourlyLimit: '50',
});

export function ComposeModal({ open, onClose, onScheduled }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [leads, setLeads] = useState<string[]>([]);
  const [fileInfo, setFileInfo] = useState<{ name: string; duplicates: number } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'leads', string>>>({});
  const [submitting, setSubmitting] = useState(false);
  // One key per compose session: a double-click or retried request can't create two campaigns.
  const idempotencyKey = useRef('');

  useEffect(() => {
    if (open) {
      setForm(initialForm());
      setLeads([]);
      setFileInfo(null);
      setErrors({});
      idempotencyKey.current = crypto.randomUUID();
    }
  }, [open]);

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrors((x) => ({ ...x, leads: 'File is larger than 5 MB' }));
      return;
    }
    const { emails, duplicates } = parseLeads(await file.text());
    e.target.value = ''; // allow re-selecting the same file after editing it
    setLeads(emails);
    setFileInfo({ name: file.name, duplicates });
    setErrors((x) => ({ ...x, leads: emails.length === 0 ? 'No email addresses found in this file' : undefined }));
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (!form.subject.trim()) next.subject = 'Subject is required';
    if (!form.body.trim()) next.body = 'Body is required';
    if (leads.length === 0) next.leads = 'Upload a CSV or text file with at least one email';
    if (leads.length > 5000) next.leads = 'At most 5000 leads per campaign';
    if (!form.startTime || Number.isNaN(new Date(form.startTime).getTime())) next.startTime = 'Pick a start time';
    const delay = Number(form.delaySeconds);
    if (!Number.isFinite(delay) || delay < 0) next.delaySeconds = 'Must be 0 or more';
    const limit = Number(form.hourlyLimit);
    if (!Number.isInteger(limit) || limit < 1) next.hourlyLimit = 'Must be a whole number of at least 1';
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  async function submit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.schedule(
        {
          subject: form.subject.trim(),
          body: form.body,
          recipients: leads,
          startTime: new Date(form.startTime).toISOString(),
          delayBetweenEmailsMs: Math.round(Number(form.delaySeconds) * 1000),
          hourlyLimit: Number(form.hourlyLimit),
        },
        idempotencyKey.current,
      );
      toast('success', `Scheduled ${res.scheduled} email${res.scheduled === 1 ? '' : 's'}`);
      onScheduled();
      onClose();
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const delayMs = Number(form.delaySeconds) * 1000;
  const lastSendIn =
    leads.length > 1 && Number.isFinite(delayMs) ? Math.round(((leads.length - 1) * delayMs) / 60000) : null;

  return (
    <Modal
      open={open}
      title="Compose new email"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Subject" error={errors.subject}>
          <Input value={form.subject} onChange={set('subject')} placeholder="Quick question about your outbound" maxLength={500} />
        </Field>

        <Field label="Body" error={errors.body}>
          <Textarea value={form.body} onChange={set('body')} placeholder="Hi there, ..." />
        </Field>

        <Field
          label="Leads (CSV or text file)"
          error={errors.leads}
          hint="Any layout works - every email address in the file is picked up, duplicates removed."
        >
          {/* The whole box sits inside the <label>, so clicking it opens the file picker. */}
          <div
            className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-gray-300 px-4 py-3 hover:border-brand-500 hover:bg-brand-50/40"
          >
            <span className="text-sm text-gray-600">{fileInfo ? fileInfo.name : 'Click to upload a .csv or .txt file'}</span>
            {fileInfo && (
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                {leads.length} email{leads.length === 1 ? '' : 's'} detected
                {fileInfo.duplicates > 0 ? ` · ${fileInfo.duplicates} duplicate${fileInfo.duplicates === 1 ? '' : 's'} removed` : ''}
              </span>
            )}
          </div>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Start time" error={errors.startTime}>
            <Input type="datetime-local" value={form.startTime} onChange={set('startTime')} />
          </Field>
          <Field label="Delay between emails (s)" error={errors.delaySeconds}>
            <Input type="number" min={0} step="0.5" value={form.delaySeconds} onChange={set('delaySeconds')} />
          </Field>
          <Field label="Hourly limit" error={errors.hourlyLimit}>
            <Input type="number" min={1} step={1} value={form.hourlyLimit} onChange={set('hourlyLimit')} />
          </Field>
        </div>

        {lastSendIn !== null && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {leads.length} emails, one every {form.delaySeconds}s → last one about {lastSendIn} min after the start time
            {leads.length > Number(form.hourlyLimit) ? `, or later: the hourly limit of ${form.hourlyLimit} will push the rest into following hours.` : '.'}
          </p>
        )}
      </div>
    </Modal>
  );
}
