import type { Input, PipeStats, Pipeline, Route } from './types';

/** One row of the pipelines overview, with the columns of Cribl's Pipelines page. */
export interface OverviewRow {
  id: string;
  description?: string;
  /** Every function, comments included, like Cribl's f(x) column. */
  functions: number;
  /** Route names, then `Source:` entries for sources that use it as pre-processing or QuickConnect pipeline. */
  attached: string[];
  /** Outputs of those routes and QuickConnect connections. The pipeline's own `output` is not shown, as in Cribl. */
  destinations: string[];
  stats?: PipeStats;
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export function overviewRows(pipelines: Pipeline[], routes: Route[], inputs: Input[], stats: Map<string, PipeStats> | null): OverviewRow[] {
  return pipelines.map((p) => {
    const rs = routes.filter((r) => r.pipeline === p.id);
    const pre = inputs.filter((i) => i.pipeline === p.id);
    const qc = inputs.flatMap((i) => (i.connections ?? []).filter((c) => c.pipeline === p.id).map((c) => ({ input: i.id, output: c.output })));
    return {
      id: p.id,
      description: p.conf.description,
      functions: p.conf.functions?.length ?? 0,
      attached: uniq([...rs.map((r) => r.name || r.id), ...pre.map((i) => `Source: ${i.id}`), ...qc.map((c) => `Source: ${c.input}`)]),
      destinations: uniq([...rs.map((r) => r.output ?? ''), ...qc.map((c) => c.output ?? '')]),
      stats: stats?.get(p.id),
    };
  });
}

/** Rows whose id, description, route, source or destination contains `query` (case-insensitive). */
export function filterRows(rows: OverviewRow[], query: string): OverviewRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => [r.id, r.description ?? '', ...r.attached, ...r.destinations].some((s) => s.toLowerCase().includes(q)));
}

/** Metric series ids are `<pipeline>` for the group's own pipelines and `<pack>.<pipeline>` inside a pack. */
export function statsById(results: Record<string, unknown>[], pack: string | null): Map<string, PipeStats> {
  const out = new Map<string, PipeStats>();
  const prefix = pack ? `${pack}.` : '';
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  for (const r of results) {
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id.startsWith(prefix)) continue;
    const pid = id.slice(prefix.length);
    if (!pid || (!pack && pid.includes('.'))) continue;
    out.set(pid, { in: num(r.inEvents), out: num(r.outEvents), dropped: num(r.dropEvents), err: num(r.errEvents) });
  }
  return out;
}

/** 1234 → "1.2K", like Cribl's stats chips. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  const units = ['K', 'M', 'B', 'T'];
  let v = n;
  let u = -1;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${units[u]}`;
}
