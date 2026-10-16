'use client';

import { useState } from 'react';
import { initials } from '@/lib/format';

const PALETTE = ['bg-brand-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500'];

/** Photo if we have one, otherwise coloured initials (stable colour per name). */
export function Avatar({
  name,
  email,
  src,
  size = 32,
}: {
  name: string | null;
  email: string;
  src?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.4) };

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? email}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  const key = (name ?? email).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <div style={style} className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${PALETTE[key % PALETTE.length]}`}>
      {initials(name, email).slice(0, 1)}
    </div>
  );
}
