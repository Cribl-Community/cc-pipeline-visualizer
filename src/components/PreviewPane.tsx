import { useMemo, useRef, useState } from 'react';
import { Alert, SelectField, Spinner } from '@capra/core';
import { ArrowRight, ChevronLeft, ChevronRight, Cog, Ellipsis, Play, Search } from '@capra/icons';
import { EventView, type ViewMode } from './EventView';
import { Popover, Toggle } from './ui';
import { pairEvents, pctChange, totals } from '../lib/diff';
import type { CriblEvent, FunctionStats, Sample } from '../lib/types';

export interface FocusInfo {
  index: number;
  name: string;
  description?: string;
  active: boolean;
  canPrev: boolean;
  canNext: boolean;
}

interface Props {
  tab: 'sample' | 'preview';
  onTab: (t: 'sample' | 'preview') => void;
  samples: Sample[];
  sampleId: string | null;
  onSample: (id: string) => void;
  sampleEvents: CriblEvent[] | null;
  sampleLoading: boolean;
  scope: 'pipe' | 'fn';
  onScope: (s: 'pipe' | 'fn') => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  showInternal: boolean;
  onShowInternal: (v: boolean) => void;
  showDropped: boolean;
  onShowDropped: (v: boolean) => void;
  canRun: boolean;
  running: boolean;
  stale: boolean;
  onRun: () => void;
  focus: FocusInfo | null;
  onStep: (dir: -1 | 1) => void;
  result: { in: CriblEvent[]; out: CriblEvent[] } | null;
  stats?: FunctionStats;
  errors: string[];
  onRemoveScratch: () => void;
}

const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Cribl's “↑ 20.0% fields ↓ 55.2% bytes” box. */
function Delta({ value, label }: { value: number; label: string }) {
  return (
    <span className={`delta${value > 0 ? ' up' : value < 0 ? ' dn' : ''}`}>
      {value > 0 ? '↑' : value < 0 ? '↓' : ''} {Math.abs(value).toFixed(1)}% <span className="delta-l">{label}</span>
    </span>
  );
}

export function PreviewPane(p: Props) {
  const [query, setQuery] = useState('');
  const gear = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<null | 'gear' | 'more'>(null);
  const picked = p.samples.find((s) => s.id === p.sampleId);
  const sampleLabel = picked ? picked.sampleName || picked.id : undefined;

  // Before the first run, show the raw sample as IN so the user sees what goes in.
  const source = useMemo(() => p.result ?? (p.sampleEvents ? { in: p.sampleEvents, out: p.sampleEvents } : null), [p.result, p.sampleEvents]);
  const pairs = useMemo(() => (source ? pairEvents(source.in, source.out, p.showInternal) : []), [source, p.showInternal]);
  const summary = useMemo(() => {
    if (!p.result) return null;
    const a = totals(p.result.in);
    const b = totals(p.result.out);
    return { a, b, dropped: pairs.filter((x) => x.status === 'dropped').length };
  }, [p.result, pairs]);

  const fnScope = p.scope === 'fn';
  const view: ViewMode = p.result ? p.view : 'in';
  const inLabel = fnScope && p.focus ? `IN · before #${p.focus.index + 1} ${p.focus.name}` : 'IN';
  const outLabel = fnScope && p.focus ? `OUT · after #${p.focus.index + 1} ${p.focus.name}` : 'OUT';
  const q = query.trim().toLowerCase();
  const samples = q ? p.samples.filter((s) => (s.sampleName || s.id).toLowerCase().includes(q)) : p.samples;

  return (
    <div className="right">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={p.tab === 'sample'} className={`tab${p.tab === 'sample' ? ' on' : ''}`} onClick={() => p.onTab('sample')}>
          Sample Data
        </button>
        <button type="button" role="tab" aria-selected={p.tab === 'preview'} className={`tab${p.tab === 'preview' ? ' on' : ''}`} onClick={() => p.onTab('preview')}>
          Simple Preview
        </button>
      </div>

      {p.tab === 'sample' ? (
        <div className="samples">
          <div className="samples-bar">
            <label className="search-in">
              <Search />
              <input placeholder="Search" value={query} aria-label="Search sample files" onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          <div className="stbl">
            <div className="stbl-row stbl-head">
              <span>File Name</span>
              <span>Created</span>
              <span>Size</span>
              <span>Events</span>
              <span>In Pack</span>
            </div>
            {samples.map((s) => (
              <div key={s.id} className={`stbl-row${s.id === p.sampleId ? ' on' : ''}`}>
                <span>
                  <button
                    type="button"
                    className="link"
                    title="Open in Simple Preview"
                    onClick={() => {
                      p.onSample(s.id);
                      p.onTab('preview');
                    }}
                  >
                    {s.sampleName || s.id}
                  </button>
                </span>
                <span>{fmtDate(s.created)}</span>
                <span>{s.size !== undefined ? fmtBytes(s.size) : ''}</span>
                <span>{s.numEvents ?? ''}</span>
                <span>{s.inPack && <span className="pack-tag">Pack</span>}</span>
              </div>
            ))}
            {!samples.length && <div className="empty">{p.samples.length ? 'No sample files match.' : 'This worker group has no sample files.'}</div>}
          </div>
        </div>
      ) : (
        <>
          <div className="ctl">
            <div className="ctl-f">
              <span className="ctl-l">Sample data file</span>
              <div className="sel-wrap" title={sampleLabel}>
                <SelectField
                  aria-label="Sample data file"
                  size="sm"
                  canSearch
                  placeholder={p.samples.length ? 'Select a sample' : 'No sample files'}
                  disabled={!p.samples.length}
                  value={p.sampleId ?? null}
                  onChange={(k) => k !== null && p.onSample(String(k))}
                  items={p.samples.map((s) => ({ id: s.id, label: s.sampleName || s.id }))}
                />
              </div>
            </div>
            <span className="ctl-arrow">
              <ArrowRight />
            </span>
            <div className="ctl-f">
              <span className="ctl-l">Preview</span>
              <div className="sel-wrap">
                <SelectField
                  aria-label="Preview scope"
                  size="sm"
                  value={p.scope}
                  onChange={(k) => k !== null && p.onScope(String(k) as 'pipe' | 'fn')}
                  items={[
                    { id: 'pipe', label: 'Whole pipeline' },
                    { id: 'fn', label: 'Before & after one function' },
                  ]}
                />
              </div>
            </div>
            <span className="spacer" />
            {p.stale && !p.running && <span className="stale">Edited since last run</span>}
            <button type="button" className="run" disabled={!p.canRun} onClick={p.onRun}>
              {p.running ? <Spinner size="sm" /> : <Play />} Run
            </button>
            <button ref={more} type="button" className="dots" aria-label="More preview actions" onClick={() => setMenu(menu === 'more' ? null : 'more')}>
              <Ellipsis />
            </button>
            {menu === 'more' && (
              <Popover anchor={more} onClose={() => setMenu(null)} align="right" width={230}>
                <div className="menu">
                  <button
                    type="button"
                    className="menu-it danger"
                    title="Delete the scratch pipeline this app uses for previews"
                    onClick={() => {
                      setMenu(null);
                      p.onRemoveScratch();
                    }}
                  >
                    Remove preview pipeline
                  </button>
                </div>
              </Popover>
            )}
          </div>

          {fnScope && (
            <div className="focusbar">
              {p.focus ? (
                <>
                  <button type="button" className="step" aria-label="Previous function" disabled={!p.focus.canPrev} onClick={() => p.onStep(-1)}>
                    <ChevronLeft />
                  </button>
                  <span className="focus-num">{p.focus.index + 1}</span>
                  <b className="focus-name">{p.focus.name}</b>
                  <button type="button" className="step" aria-label="Next function" disabled={!p.focus.canNext} onClick={() => p.onStep(1)}>
                    <ChevronRight />
                  </button>
                  {p.focus.description && <span className="mut ell">{p.focus.description}</span>}
                  <span className="spacer" />
                  {!p.focus.active ? (
                    <span className="fstat">Inactive: passes events through unchanged</span>
                  ) : p.stats ? (
                    <span className="fstats">
                      <span className="fstat">
                        Events <b>{p.stats.eventsIn}</b> → <b>{p.stats.eventsOut}</b>
                      </span>
                      <span className="fstat">
                        Bytes <b>{fmtBytes(p.stats.bytesIn)}</b> → <b>{fmtBytes(p.stats.bytesOut)}</b>
                      </span>
                      <span className="fstat">{p.stats.duration.toFixed(2)} ms</span>
                    </span>
                  ) : summary ? (
                    // Cribl does not always return per-function stats; derive them from IN and OUT.
                    <span className="fstats">
                      <span className="fstat">
                        Events <b>{summary.a.events}</b> → <b>{summary.b.events}</b>
                      </span>
                      <span className="fstat">
                        Bytes <b>{fmtBytes(summary.a.bytes)}</b> → <b>{fmtBytes(summary.b.bytes)}</b>
                      </span>
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="mut">Click the ◎ on a function to see the data just before and just after it.</span>
              )}
            </div>
          )}

          <div className="vbar">
            <div className="seg" role="radiogroup" aria-label="Event view">
              {(
                [
                  ['in', 'IN'],
                  ['out', 'OUT'],
                  ['split', 'IN | OUT'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={view === k} disabled={!p.result && k !== 'in'} className={`seg-b${view === k ? ' on' : ''}`} onClick={() => p.onView(k)}>
                  {label}
                </button>
              ))}
            </div>
            {summary && (
              <div className="deltas" title={`${summary.a.events} → ${summary.b.events} events`}>
                <Delta value={pctChange(summary.a.fields, summary.b.fields)} label="fields" />
                <Delta value={pctChange(summary.a.bytes, summary.b.bytes)} label="bytes" />
                {summary.dropped > 0 && <span className="delta up">{summary.dropped} dropped</span>}
              </div>
            )}
            <span className="spacer" />
            <span className="mut small">{source ? `${source.in.length} events` : ''}</span>
            <button ref={gear} type="button" className="tb" aria-label="Preview settings" onClick={() => setMenu(menu === 'gear' ? null : 'gear')}>
              <Cog />
            </button>
            {menu === 'gear' && (
              <Popover anchor={gear} onClose={() => setMenu(null)} align="right" width={230}>
                <div className="menu opts">
                  <label>
                    <Toggle label="Show dropped events" checked={p.showDropped} onChange={p.onShowDropped} /> Show dropped events
                  </label>
                  <label>
                    <Toggle label="Show internal fields" checked={p.showInternal} onChange={p.onShowInternal} /> Show internal fields
                  </label>
                </div>
              </Popover>
            )}
          </div>

          {p.errors.length > 0 && (
            <div className="errs">
              <Alert appearance="danger" title="Preview reported errors">
                <ul>
                  {p.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          )}

          <div className="events">
            {(p.running && !p.result) || p.sampleLoading ? (
              <div className="empty">
                <Spinner size="sm" /> {p.sampleLoading ? 'Loading sample…' : 'Running preview…'}
              </div>
            ) : source ? (
              <EventView pairs={pairs} mode={view} showInternal={p.showInternal} showDropped={p.showDropped} inLabel={inLabel} outLabel={outLabel} />
            ) : (
              <div className="empty">{!p.sampleId ? 'Select a sample data file, then click Run.' : fnScope && !p.focus ? 'Select a function, then click Run.' : 'Click Run to preview.'}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
