import type { CriblEvent } from './types';

// Bookkeeping fields the preview engine adds to every event. Never shown.
const PREVIEW_FIELDS = new Set([
  '__criblEventType',
  '__ctrlFields',
  '__final',
  '__cloneCount',
  '__id',
  '__packId',
  '__isDropped',
  '__dropped',
  '__criblDropped',
]);

export type FieldStatus = 'same' | 'added' | 'removed' | 'changed';

export interface FieldRow {
  key: string;
  value: unknown;
  status: FieldStatus;
}

export type PairStatus = 'same' | 'changed' | 'dropped' | 'new';

export interface EventPair {
  key: string;
  seq: number;
  in?: CriblEvent;
  out?: CriblEvent;
  status: PairStatus;
}

export function isDropped(ev: CriblEvent): boolean {
  return !!(ev.__isDropped || ev.__dropped || ev.__criblDropped);
}

export function visibleKeys(ev: CriblEvent, showInternal: boolean): string[] {
  const keys = Object.keys(ev).filter((k) => !PREVIEW_FIELDS.has(k) && (showInternal || !k.startsWith('__')));
  // Cribl's ordering: _raw, _time first, then alphabetical.
  const rank = (k: string) => (k === '_raw' ? 0 : k === '_time' ? 1 : 2);
  return keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Field-level diff: OUT fields in order, removed IN fields appended as struck-through rows. */
export function diffFields(inEv: CriblEvent | undefined, outEv: CriblEvent, showInternal: boolean): FieldRow[] {
  const rows: FieldRow[] = visibleKeys(outEv, showInternal).map((key) => ({
    key,
    value: outEv[key],
    status: !inEv ? 'same' : !(key in inEv) ? 'added' : same(inEv[key], outEv[key]) ? 'same' : 'changed',
  }));
  if (inEv) {
    for (const key of visibleKeys(inEv, showInternal)) {
      if (!(key in outEv)) rows.push({ key, value: inEv[key], status: 'removed' });
    }
  }
  return rows;
}

export function plainFields(ev: CriblEvent, showInternal: boolean): FieldRow[] {
  return visibleKeys(ev, showInternal).map((key) => ({ key, value: ev[key], status: 'same' }));
}

const idOf = (ev: CriblEvent, fallback: number) => (ev.__id === undefined ? `#${fallback}` : String(ev.__id));

/**
 * Pair IN and OUT events by the preview's `__id`. Clones share their parent's id, so an IN
 * event can pair with several OUT events (the extras are reported as `new`).
 */
export function pairEvents(inEvents: CriblEvent[], outEvents: CriblEvent[], showInternal = false): EventPair[] {
  const outById = new Map<string, CriblEvent[]>();
  outEvents.forEach((ev, i) => {
    const id = idOf(ev, i);
    const list = outById.get(id);
    if (list) list.push(ev);
    else outById.set(id, [ev]);
  });

  const pairs: EventPair[] = [];
  const used = new Set<string>();
  let seq = 0;
  inEvents.forEach((inEv, i) => {
    const id = idOf(inEv, i);
    const outs = (outById.get(id) ?? []).filter((o) => !isDropped(o));
    used.add(id);
    if (outs.length === 0) {
      pairs.push({ key: `${id}`, seq: seq++, in: inEv, status: 'dropped' });
      return;
    }
    outs.forEach((outEv, j) => {
      const changed = j > 0 || diffFields(inEv, outEv, showInternal).some((r) => r.status !== 'same');
      pairs.push({
        key: `${id}.${j}`,
        seq: seq++,
        in: j === 0 ? inEv : undefined,
        out: outEv,
        status: j > 0 ? 'new' : changed ? 'changed' : 'same',
      });
    });
  });
  outEvents.forEach((outEv, i) => {
    const id = idOf(outEv, i);
    if (!used.has(id) && !isDropped(outEv)) pairs.push({ key: `new-${id}-${i}`, seq: seq++, out: outEv, status: 'new' });
  });
  return pairs;
}

export function eventBytes(ev: CriblEvent): number {
  let n = 0;
  for (const k of visibleKeys(ev, false)) {
    const v = ev[k];
    n += k.length + (typeof v === 'string' ? v.length : JSON.stringify(v ?? null).length);
  }
  return n;
}

export interface Totals {
  events: number;
  fields: number;
  bytes: number;
}

export function totals(events: CriblEvent[]): Totals {
  const live = events.filter((e) => !isDropped(e));
  return {
    events: live.length,
    fields: live.reduce((n, e) => n + visibleKeys(e, false).length, 0),
    bytes: live.reduce((n, e) => n + eventBytes(e), 0),
  };
}

/** Signed percentage change, rounded to one decimal; 0 when there is no baseline. */
export function pctChange(before: number, after: number): number {
  if (!before) return 0;
  return Math.round(((after - before) / before) * 1000) / 10;
}

export function valueType(v: unknown): 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v === 'object' ? 'object' : (typeof v as 'string' | 'number' | 'boolean');
}
