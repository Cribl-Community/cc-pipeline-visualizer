import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** Small pieces that mimic Cribl's (Ant Design based) pipeline editor controls. */

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`tgl${checked ? ' on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <span className="tgl-h" />
    </button>
  );
}

const TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\/(?:\\.|[^/\\\n])+\/[gimsuy]*(?=\s*[.,);]|$)|\b[A-Z][\w$]*|\b\d+(?:\.\d+)?\b|\b(?:true|false|null|undefined|new|typeof|instanceof|in|return|const|let|var|if|else)\b)/g;

/** Monaco-like colouring of JS, as in Cribl's Filter column and code editors. */
export function Js({ code }: { code: string }) {
  const parts = code.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (i % 2 === 0) return <span key={i}>{p}</span>;
        const cls = /^\/[/*]/.test(p) ? 'js-c' : /^['"`]/.test(p) ? 'js-s' : /^\//.test(p) ? 'js-r' : /^\d/.test(p) ? 'js-n' : /^[A-Z]/.test(p) ? 'js-g' : 'js-k';
        return (
          <span key={i} className={cls}>
            {p}
          </span>
        );
      })}
    </>
  );
}

/**
 * Fixed-position popover anchored to an element, closed by outside click or Escape.
 * Fixed positioning keeps it from being clipped by the scrolling function list.
 */
export function Popover({
  anchor,
  onClose,
  children,
  align = 'left',
  width,
}: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    if (!a) return;
    const w = width ?? ref.current?.offsetWidth ?? 240;
    const left = Math.max(8, Math.min(align === 'right' ? a.right - w : a.left, window.innerWidth - w - 8));
    const below = window.innerHeight - a.bottom - 12;
    const above = a.top - 12;
    if (below >= 320 || below >= above) setPos({ top: a.bottom + 4, left, maxH: below });
    else setPos({ bottom: window.innerHeight - a.top + 4, left, maxH: above });
  }, [anchor, align, width]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      className="pop"
      style={pos ? { top: pos.top, bottom: pos.bottom, left: pos.left, width, maxHeight: pos.maxH } : { top: -9999, left: -9999, width }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
