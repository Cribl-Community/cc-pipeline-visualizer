import { useState } from 'react';
import { diffFields, plainFields, valueType, type EventPair, type FieldRow } from '../lib/diff';
import type { CriblEvent } from '../lib/types';

export type ViewMode = 'split' | 'in' | 'out';

const PAGE = 50;
const LONG = 300;
const TYPE_GLYPH = { string: 'α', number: '#', boolean: 'b', object: '{}', array: '[]', null: '∅' } as const;
const STATUS_CLASS = { same: '', added: 'add', removed: 'rem', changed: 'chg' } as const;

function show(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  return JSON.stringify(v);
}

/** Cribl's event timestamp, e.g. “2025-06-20 16:33:23.000 +02:00”, from `_time` (seconds), as date/time/zone parts. */
function stamp(ev?: CriblEvent): string[] {
  const t = ev?._time;
  if (typeof t !== 'number') return [];
  const d = new Date(t * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const tz = `${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`, tz];
}

function Value({ text }: { text: string }) {
  const [full, setFull] = useState(false);
  if (text.length <= LONG || full) return <span className="v">{text}</span>;
  return (
    <span className="v">
      {text.slice(0, LONG)}…{' '}
      <button type="button" className="show-more" onClick={() => setFull(true)}>
        Show more
      </button>
    </span>
  );
}

function Fields({ rows }: { rows: FieldRow[] }) {
  return (
    <div className="flds">
      {rows.map((r) => (
        <div key={r.key} className={`f ${STATUS_CLASS[r.status]}${r.key.startsWith('__') ? ' int' : ''}`}>
          <span className="t">{TYPE_GLYPH[valueType(r.value)]}</span>
          <span className="k">{r.key}:</span>
          <Value text={show(r.value)} />
        </div>
      ))}
    </div>
  );
}

function Meta({ n, ev, tag }: { n: number; ev?: CriblEvent; tag?: 'dropped' | 'new' }) {
  return (
    <div className="meta">
      <span className="n">{n}</span>
      <span className="ts">
        {stamp(ev).map((part) => (
          <span key={part}>{part}</span>
        ))}
      </span>
      {tag === 'dropped' && <span className="drop-tag">Dropped</span>}
      {tag === 'new' && <span className="new-tag">New</span>}
    </div>
  );
}

/** IN fields, with the ones the step removes or changes tinted so both columns line up visually. */
function inRows(inEv: CriblEvent, outEv: CriblEvent | undefined, showInternal: boolean): FieldRow[] {
  const rows = plainFields(inEv, showInternal);
  if (!outEv) return rows;
  return rows.map((r) => ({
    ...r,
    status: !(r.key in outEv) ? 'removed' : JSON.stringify(outEv[r.key]) !== JSON.stringify(r.value) ? 'changed' : 'same',
  }));
}

interface Props {
  pairs: EventPair[];
  mode: ViewMode;
  showInternal: boolean;
  showDropped: boolean;
  inLabel: string;
  outLabel: string;
}

export function EventView({ pairs, mode, showInternal, showDropped, inLabel, outLabel }: Props) {
  const [limit, setLimit] = useState(PAGE);
  const shown = pairs.filter((p) => showDropped || p.status !== 'dropped' || mode === 'in');
  const visible = shown.slice(0, limit);

  if (!pairs.length) return <div className="empty">No events.</div>;

  return (
    <div className={`evl ${mode}`}>
      {mode === 'split' ? (
        <div className="evh split-h">
          <span>#</span>
          <span>{inLabel}</span>
          <span>{outLabel}</span>
        </div>
      ) : (
        <div className="evh">
          <span>#</span>
          <span>Event</span>
        </div>
      )}
      {visible.map((p, i) => {
        const dropped = p.status === 'dropped';
        if (mode === 'split') {
          return (
            <div key={p.key} className="ev split-ev">
              <Meta n={i + 1} ev={p.in ?? p.out} tag={dropped ? 'dropped' : p.status === 'new' ? 'new' : undefined} />
              {p.in ? <Fields rows={inRows(p.in, p.out, showInternal)} /> : <div className="flds hint">New event</div>}
              {p.out ? (
                <Fields rows={diffFields(p.in, p.out, showInternal)} />
              ) : (
                <div className="flds dropped-col">
                  <span className="hint">Dropped by this {p.in ? 'function' : 'pipeline'}</span>
                </div>
              )}
            </div>
          );
        }
        if (mode === 'in') {
          if (!p.in) return null;
          return (
            <div key={p.key} className="ev">
              <Meta n={i + 1} ev={p.in} />
              <Fields rows={plainFields(p.in, showInternal)} />
            </div>
          );
        }
        return (
          <div key={p.key} className={`ev${dropped ? ' dropped' : ''}`}>
            <Meta n={i + 1} ev={p.out ?? p.in} tag={dropped ? 'dropped' : p.status === 'new' ? 'new' : undefined} />
            <Fields rows={p.out ? diffFields(p.in, p.out, showInternal) : plainFields(p.in!, showInternal)} />
          </div>
        );
      })}
      {shown.length > limit && (
        <div className="more">
          <button type="button" className="link" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, shown.length - limit)} more of {shown.length - limit} remaining
          </button>
        </div>
      )}
    </div>
  );
}
