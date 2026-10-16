// Pragmatic email pattern - good enough to pull addresses out of any CSV/text layout.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface ParsedLeads {
  emails: string[];
  duplicates: number;
}

/**
 * Extracts every email address from a CSV or plain-text file, whatever the column layout
 * (header row, extra columns, one-per-line...). Keeps first-seen order, removes duplicates.
 */
export function parseLeads(text: string): ParsedLeads {
  const found = text.match(EMAIL_RE) ?? [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const raw of found) {
    const e = raw.toLowerCase();
    if (!seen.has(e)) {
      seen.add(e);
      emails.push(e);
    }
  }
  return { emails, duplicates: found.length - emails.length };
}
