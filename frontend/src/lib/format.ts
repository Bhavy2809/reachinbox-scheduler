/** "Tue 9:15:12 AM" - the badge format used in the inbox rows. */
export function badgeTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${day} ${time}`;
}

/** "Nov 3, 10:23 AM" - used in the email detail header. */
export function longDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "in 3m", "2h ago" */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, 'd'],
    [3_600_000, 'h'],
    [60_000, 'm'],
    [1000, 's'],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      return diff >= 0 ? `in ${n}${label}` : `${n}${label} ago`;
    }
  }
  return 'now';
}

/** Value for <input type="datetime-local"> in the user's local timezone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function initials(name: string | null, email: string): string {
  const src = name?.trim() || email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Strip tags for "is the editor actually empty?" checks. */
export function htmlIsEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}
