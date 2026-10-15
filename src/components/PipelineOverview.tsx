import { useMemo, useState } from 'react';
import { Spinner } from '@capra/core';
import { CaretDown, CaretUp, Reload, Search } from '@capra/icons';
import { compact, filterRows, type OverviewRow } from '../lib/overview';

/** `null` while loading, an error message when the metrics query failed, otherwise `'ok'`. */
export type StatsState = 'ok' | string | null;

interface Props {
  rows: OverviewRow[];
  /** "pack my-pack" or "worker group seLab", for the empty and count texts. */
  scopeLabel: string;
  loading: boolean;
  /** Routes and sources could not be read; the Route / Source and Destination columns are then incomplete. */
  wiringError: string | null;
  stats: StatsState;
  onRefreshStats: () => void;
  onOpen: (id: string) => void;
}

const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'None');

function Many({ items }: { items: string[] }) {
  if (!items.length) return <span className="mut">None</span>;
  return (
    <span className="ell" title={items.join('\n')}>
      {items[0]}
      {items.length > 1 && <span className="mut"> +{items.length - 1}</span>}
    </span>
  );
}

function Stats({ row, state }: { row: OverviewRow; state: StatsState }) {
  if (state === null) return <span className="mut">…</span>;
  if (state !== 'ok') return <span className="mut" title={state}>n/a</span>;
  const s = row.stats ?? { in: 0, out: 0, dropped: 0, err: 0 };
  return (
    <span className="ov-st" title={`Last 15 minutes: ${s.in} in, ${s.out} out, ${s.dropped} dropped, ${s.err} errors`}>
      <span>
        <b>{compact(s.in)}</b> In
      </span>
      <span>
        <b>{compact(s.out)}</b> Out
      </span>
      <span className={s.err ? 'bad' : undefined}>
        <b>{compact(s.err)}</b> Err
      </span>
    </span>
  );
}

/** The pipelines of a pack or worker group, laid out like Cribl's Processing → Pipelines page. */
export function PipelineOverview(p: Props) {
  const [query, setQuery] = useState('');
  const [desc, setDesc] = useState(false);
  const shown = useMemo(() => {
    const rs = filterRows(p.rows, query);
    return desc ? [...rs].reverse() : rs;
  }, [p.rows, query, desc]);

  return (
    <div className="ov">
      <div className="ov-bar">
        <label className="search-in">
          <Search />
          <input placeholder="Filter pipelines" value={query} aria-label="Filter pipelines" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <span className="mut">
          {query.trim() ? `${shown.length} of ${p.rows.length}` : p.rows.length} pipeline{p.rows.length === 1 ? '' : 's'} in {p.scopeLabel}
        </span>
        <span className="spacer" />
        {p.stats !== null && p.stats !== 'ok' && <span className="hint">Stats unavailable</span>}
        <button type="button" className="tb" title="Refresh stats (last 15 minutes)" aria-label="Refresh stats" disabled={p.stats === null} onClick={p.onRefreshStats}>
          {p.stats === null ? <Spinner size="sm" /> : <Reload />}
        </button>
      </div>
      {p.wiringError && <div className="ov-note hint">Routes and sources could not be read, so Route / Source and Destination may be incomplete. {p.wiringError}</div>}
      <div className="ov-tbl" role="table" aria-label="Pipelines">
        <div className="ov-row ov-head" role="row">
          <button type="button" className="ov-sort" role="columnheader" aria-sort={desc ? 'descending' : 'ascending'} onClick={() => setDesc(!desc)}>
            Pipeline {desc ? <CaretDown /> : <CaretUp />}
          </button>
          <span role="columnheader">Route / Source</span>
          <span role="columnheader" className="ov-num">
            f(x)
          </span>
          <span role="columnheader">Destination</span>
          <span role="columnheader">Description</span>
          <span role="columnheader">Stats</span>
        </div>
        {shown.map((r) => (
          <div key={r.id} className="ov-row" role="row" onClick={() => p.onOpen(r.id)}>
            <span className="ell">
              <button
                type="button"
                className="link"
                title={`Open ${r.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onOpen(r.id);
                }}
              >
                {r.id}
              </button>
            </span>
            <Many items={r.attached} />
            <span className="ov-num">{r.functions}</span>
            <span className="ell" title={list(r.destinations)}>
              {r.destinations.length ? list(r.destinations) : <span className="mut">None</span>}
            </span>
            <span className="ell mut" title={r.description}>
              {r.description}
            </span>
            <Stats row={r} state={p.stats} />
          </div>
        ))}
        {!shown.length && !p.loading && <div className="empty">{p.rows.length ? 'No pipelines match.' : `There are no pipelines in ${p.scopeLabel}.`}</div>}
      </div>
    </div>
  );
}
