/* Small inline icon set (stroke icons, 1.5px) so the UI has no icon-font dependency. */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} {...p}>
      {children}
    </svg>
  );
}

export const ClockIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const SendIcon = (p: P) => (
  <Svg {...p}><path d="M21 3 10 14" /><path d="M21 3l-7 18-4-7-7-4 18-7z" /></Svg>
);
export const SearchIcon = (p: P) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);
export const RefreshIcon = (p: P) => (
  <Svg {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Svg>
);
export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z" />
  </Svg>
);
export const ChevronDownIcon = (p: P) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const ArrowLeftIcon = (p: P) => (
  <Svg {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Svg>
);
export const UploadIcon = (p: P) => (
  <Svg {...p}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></Svg>
);
export const ArchiveIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Svg>
);
export const CalendarIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Svg>
);
export const LogoutIcon = (p: P) => (
  <Svg {...p}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="m10 17-5-5 5-5" /><path d="M5 12h11" /></Svg>
);
export const ExternalIcon = (p: P) => (
  <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></Svg>
);
export const XIcon = (p: P) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);

// ---- editor toolbar ----
export const UndoIcon = (p: P) => (<Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Svg>);
export const RedoIcon = (p: P) => (<Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></Svg>);
export const TextSizeIcon = (p: P) => (<Svg {...p}><path d="M3 7V5h11v2M8.5 5v14M13 13v-1h8v1M17 12v7" /></Svg>);
export const BoldIcon = (p: P) => (<Svg {...p} strokeWidth={2.2}><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" /></Svg>);
export const ItalicIcon = (p: P) => (<Svg {...p}><path d="M14 5h-4M14 19h-4M14 5l-4 14" /><path d="M10 5h6M8 19h6" /></Svg>);
export const UnderlineIcon = (p: P) => (<Svg {...p}><path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" /></Svg>);
export const AlignIcon = (p: P) => (<Svg {...p}><path d="M4 6h16M7 12h10M4 18h16" /></Svg>);
export const OrderedListIcon = (p: P) => (<Svg {...p}><path d="M10 6h11M10 12h11M10 18h11M4 5h1v4M4 9h2M4 14.5a1 1 0 0 1 2 .5L4 18h2.2" /></Svg>);
export const BulletListIcon = (p: P) => (<Svg {...p}><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4.5" cy="6" r=".8" fill="currentColor" /><circle cx="4.5" cy="12" r=".8" fill="currentColor" /><circle cx="4.5" cy="18" r=".8" fill="currentColor" /></Svg>);
export const IndentIcon = (p: P) => (<Svg {...p}><path d="M11 6h10M11 12h10M11 18h10M3 8l4 4-4 4" /></Svg>);
export const OutdentIcon = (p: P) => (<Svg {...p}><path d="M11 6h10M11 12h10M11 18h10M7 8l-4 4 4 4" /></Svg>);
export const QuoteIcon = (p: P) => (<Svg {...p}><path d="M6 17c-1.5 0-2.5-1-2.5-2.8C3.5 10.8 5.5 8 8 7M15 17c-1.5 0-2.5-1-2.5-2.8 0-3.4 2-6.2 4.5-7.2" /></Svg>);
export const StrikeIcon = (p: P) => (<Svg {...p}><path d="M4 12h16M16 6.5A4 4 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 1.2.8 2.2 2.5 2.8M8 17.5A4.5 4.5 0 0 0 12 19c2.5 0 4-1.4 4-3.2 0-.7-.2-1.3-.6-1.8" /></Svg>);
export const FilterIcon = (p: P) => (
  <Svg {...p}><path d="M4 5h16l-6 7.5V19l-4 1v-7.5L4 5z" /></Svg>
);
export const ClipIcon = (p: P) => (
  <Svg {...p}><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></Svg>
);
