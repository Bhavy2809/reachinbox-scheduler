'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignIcon,
  BoldIcon,
  BulletListIcon,
  ChevronDownIcon,
  IndentIcon,
  ItalicIcon,
  OrderedListIcon,
  OutdentIcon,
  QuoteIcon,
  RedoIcon,
  StrikeIcon,
  TextSizeIcon,
  UnderlineIcon,
  UndoIcon,
} from './Icons';

/**
 * Lightweight rich-text editor: a contentEditable area + the browser's built-in
 * editing commands. Output is HTML, which the backend sends as the email's HTML part.
 */

function exec(command: string, value?: string) {
  // execCommand is deprecated in the spec but still supported by every browser and is
  // the simplest dependency-free way to get bold/lists/undo in a contentEditable.
  document.execCommand(command, false, value);
}

function ToolButton({ title, onClick, active, children }: { title: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      // mousedown + preventDefault keeps the text selection inside the editor
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`rounded-md p-1.5 transition hover:bg-surface-100 hover:text-gray-900 ${active ? 'bg-surface-100 text-gray-900' : 'text-gray-500'}`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px bg-gray-200" />;

const SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
];
const ALIGNS = ['justifyLeft', 'justifyCenter', 'justifyRight'] as const;

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Type Your Reply...',
  error,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [alignIdx, setAlignIdx] = useState(0);
  const [, force] = useState(0); // re-render so active states update

  // Only push external value into the DOM when it differs (e.g. form reset) to keep the caret stable.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    // A cleared contentEditable often leaves a stray <br>; treat it as empty so the placeholder shows.
    if (el.innerHTML === '<br>' || el.innerHTML === '<div><br></div>') el.innerHTML = '';
    onChange(el.innerHTML);
    force((n) => n + 1);
  };

  const run = (cmd: string, v?: string) => {
    ref.current?.focus();
    exec(cmd, v);
    emit();
  };

  const isOn = (cmd: string) => {
    try {
      return typeof document !== 'undefined' && document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };

  return (
    <div className={`flex min-h-[420px] flex-col rounded-xl bg-surface-50 ring-1 ${error ? 'ring-red-300' : 'ring-transparent'}`}>
      <div className="px-4 pt-3">
        <div className="flex flex-wrap items-center gap-0.5 rounded-full bg-white px-2 py-1 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]">
          <ToolButton title="Undo" onClick={() => run('undo')}><UndoIcon width={15} height={15} /></ToolButton>
          <ToolButton title="Redo" onClick={() => run('redo')}><RedoIcon width={15} height={15} /></ToolButton>
          <Divider />
          <div className="relative">
            <ToolButton title="Text size" onClick={() => setSizeOpen((o) => !o)}>
              <span className="flex items-center gap-0.5">
                <TextSizeIcon width={15} height={15} />
                <ChevronDownIcon width={10} height={10} />
              </span>
            </ToolButton>
            {sizeOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-lg border border-gray-100 bg-white py-1 shadow-pop">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      run('fontSize', s.value);
                      setSizeOpen(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-surface-100"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Divider />
          <ToolButton title="Bold" active={isOn('bold')} onClick={() => run('bold')}><BoldIcon width={14} height={14} /></ToolButton>
          <ToolButton title="Italic" active={isOn('italic')} onClick={() => run('italic')}><ItalicIcon width={14} height={14} /></ToolButton>
          <ToolButton title="Underline" active={isOn('underline')} onClick={() => run('underline')}><UnderlineIcon width={14} height={14} /></ToolButton>
          <Divider />
          <ToolButton
            title="Align (left / center / right)"
            onClick={() => {
              const next = (alignIdx + 1) % ALIGNS.length;
              setAlignIdx(next);
              run(ALIGNS[next]);
            }}
          >
            <AlignIcon width={15} height={15} />
          </ToolButton>
          <Divider />
          <ToolButton title="Numbered list" active={isOn('insertOrderedList')} onClick={() => run('insertOrderedList')}><OrderedListIcon width={15} height={15} /></ToolButton>
          <ToolButton title="Bulleted list" active={isOn('insertUnorderedList')} onClick={() => run('insertUnorderedList')}><BulletListIcon width={15} height={15} /></ToolButton>
          <ToolButton title="Indent" onClick={() => run('indent')}><IndentIcon width={15} height={15} /></ToolButton>
          <ToolButton title="Outdent" onClick={() => run('outdent')}><OutdentIcon width={15} height={15} /></ToolButton>
          <ToolButton title="Quote" onClick={() => run('formatBlock', 'blockquote')}><QuoteIcon width={15} height={15} /></ToolButton>
          <Divider />
          <ToolButton title="Strikethrough" active={isOn('strikeThrough')} onClick={() => run('strikeThrough')}><StrikeIcon width={15} height={15} /></ToolButton>
        </div>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-placeholder={placeholder}
        onInput={emit}
        onKeyUp={() => force((n) => n + 1)}
        onMouseUp={() => force((n) => n + 1)}
        className="editor-content flex-1 px-5 py-4 text-sm leading-relaxed text-gray-900 focus:outline-none"
      />
      {error && <p className="px-5 pb-3 text-2xs text-red-600">{error}</p>}
    </div>
  );
}
