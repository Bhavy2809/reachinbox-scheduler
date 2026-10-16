/**
 * Minimal client-side HTML sanitizer for showing an email body we sent.
 * Drops script-capable elements, inline event handlers and javascript: URLs.
 * (The body is the user's own content, but we still never inject raw HTML.)
 */
const BLOCKED = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON']);

export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (BLOCKED.has(child.tagName)) {
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
          child.removeAttribute(attr.name);
        }
      }
      if (child.tagName === 'A') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

/** Older emails were stored as plain text: escape them and keep line breaks. */
export function bodyToSafeHtml(body: string): string {
  if (/<[a-z][\s\S]*>/i.test(body)) return sanitizeHtml(body);
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\n/g, '<br>');
}
