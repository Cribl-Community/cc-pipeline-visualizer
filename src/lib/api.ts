import { statsById } from './overview';
import type { ConfigGroup, CriblEvent, FunctionMeta, FunctionStats, Input, Pack, PipeStats, Pipeline, PipelineConf, PreviewResult, Route, Sample } from './types';

// Pipeline the app writes previews into. The preview API only runs a *saved*
// pipeline, so every preview overwrites this one with the conf being previewed.
export const SCRATCH_PIPELINE_ID = 'ppc_scratch_preview';

const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const api = () => window.CRIBL_API_URL;
const enc = encodeURIComponent;
/** Where a pipeline lives: inside a pack (`/m/g/p/pack`) or directly in the worker group (`/m/g`). */
export type PackId = string | null;
const groupBase = (group: string) => `${api()}/m/${enc(group)}`;
const scopeBase = (group: string, pack: PackId) => (pack ? `${groupBase(group)}/p/${enc(pack)}` : groupBase(group));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const isRead = !init.method || init.method === 'GET';
  for (let attempt = 1; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = text;
        try {
          const j = JSON.parse(text) as { message?: string; error?: string };
          msg = j.message || j.error || text;
        } catch {
          /* body was not JSON; keep the raw text */
        }
        // Only reads and rate limits/5xx are retried; writes are not replayed on 4xx.
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS && (isRead || res.status === 429)) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw new ApiError(`${init.method ?? 'GET'} ${url.replace(api(), '')} failed (${res.status}): ${msg || res.statusText}`, res.status);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (isRead && attempt < MAX_ATTEMPTS) {
        console.warn(`[cribl-pipeline-visualizer] retrying ${url}`, err);
        await sleep(400 * 2 ** attempt);
        continue;
      }
      const reason = (err as Error).name === 'AbortError' ? 'timed out' : (err as Error).message;
      throw new ApiError(`${init.method ?? 'GET'} ${url.replace(api(), '')} ${reason}`, 0);
    } finally {
      clearTimeout(timer);
    }
  }
}

interface Items<T> {
  items?: T[];
  count?: number;
}

export async function listWorkerGroups(): Promise<ConfigGroup[]> {
  const data = await request<Items<ConfigGroup>>(`${api()}/master/groups`);
  return (data.items ?? []).filter((g) => !g.isSearch && !g.isFleet && g.type !== 'lake_access');
}

export async function listPacks(group: string): Promise<Pack[]> {
  const data = await request<Items<Pack>>(`${api()}/m/${enc(group)}/packs`);
  return (data.items ?? []).sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
}

export async function listPipelines(group: string, pack: PackId): Promise<Pipeline[]> {
  const data = await request<Items<Pipeline>>(`${scopeBase(group, pack)}/pipelines`);
  // The group list also has a `pack:<id>` entry per pack (the pack used as a pipeline); those are opened as packs.
  return (data.items ?? []).filter((p) => p.id !== SCRATCH_PIPELINE_ID && !p.id.startsWith('pack:')).sort((a, b) => a.id.localeCompare(b.id));
}

export async function getPipeline(group: string, pack: PackId, id: string): Promise<Pipeline> {
  const data = await request<Items<Pipeline>>(`${scopeBase(group, pack)}/pipelines/${enc(id)}`);
  const p = data.items?.[0];
  if (!p?.conf) throw new ApiError(`Pipeline ${id} returned no configuration`, 404);
  return { id: p.id, conf: { ...p.conf, functions: p.conf.functions ?? [] } };
}

/** Every route of the pack's (or worker group's) routing tables. */
export async function listRoutes(group: string, pack: PackId): Promise<Route[]> {
  const data = await request<Items<{ id: string; routes?: Route[] }>>(`${scopeBase(group, pack)}/routes`);
  return (data.items ?? []).flatMap((t) => t.routes ?? []);
}

/** Sources of the pack (or worker group), for their pre-processing and QuickConnect pipelines. */
export async function listInputs(group: string, pack: PackId): Promise<Input[]> {
  const data = await request<Items<Input>>(`${scopeBase(group, pack)}/system/inputs`);
  return data.items ?? [];
}

/** Events in/out/dropped/errored per pipeline over the last 15 minutes: the query Cribl's Pipelines page runs. */
export async function pipelineStats(group: string, pack: PackId): Promise<Map<string, PipeStats>> {
  const where = [`(id != null)`, `(__worker_group==${JSON.stringify(group)})`, ...(pack ? [`(id.startsWith(${JSON.stringify(`${pack}.`)}))`] : [])].join(' && ');
  const data = await request<{ results?: Record<string, unknown>[] }>(`${api()}/system/metrics/query`, {
    method: 'POST',
    body: JSON.stringify({
      where,
      aggs: {
        aggregations: [
          'sum("pipe.out_events").as("outEvents")',
          'sum("pipe.in_events").as("inEvents")',
          'sum("pipe.dropped_events").as("dropEvents")',
          'sum("pipe.err_events").as("errEvents")',
        ],
        splitBys: ['id'],
        cumulative: true,
      },
      earliest: '900s',
      latest: Date.now(),
    }),
  });
  return statsById(data.results ?? [], pack);
}

export async function listFunctions(group: string, pack: PackId): Promise<FunctionMeta[]> {
  const data = await request<Items<FunctionMeta>>(`${scopeBase(group, pack)}/functions`);
  return (data.items ?? [])
    .filter((f) => f.group !== '_internal_' && f.group !== 'Deprecated Functions')
    .map((f) => ({ id: f.id, name: f.name, group: f.group, schema: f.schema, uischema: f.uischema }));
}

const lookupCache = new Map<string, Promise<{ value: string; label: string }[]>>();

/**
 * Choices for Cribl's ApiLookup widgets (lookup files, timezones, breakers…), read-only GETs
 * scoped like Cribl does: pack, worker group (`ignorePackContext`) or global (`ignoreContext`).
 * Cached in memory for the session.
 */
export function lookupOptions(
  group: string,
  pack: PackId,
  url: string,
  o: { ignorePackContext?: boolean; ignoreContext?: boolean; valueProp?: string; labelProp?: string } = {},
): Promise<{ value: string; label: string }[]> {
  const base = o.ignoreContext ? api() : o.ignorePackContext ? groupBase(group) : scopeBase(group, pack);
  const full = `${base}${url}`;
  const key = `${full}|${o.valueProp}|${o.labelProp}`;
  let hit = lookupCache.get(key);
  if (!hit) {
    hit = request<Items<Record<string, unknown>>>(full)
      .then((d) =>
        (d.items ?? []).map((it) => {
          const value = String(it[o.valueProp ?? 'id'] ?? '');
          return { value, label: String(it[o.labelProp ?? ''] ?? value) };
        }),
      )
      .catch(() => {
        lookupCache.delete(key);
        return [];
      });
    lookupCache.set(key, hit);
  }
  return hit;
}

export type ParserLibEntry = Record<string, unknown> & { id: string; type?: string; description?: string };
let parserLib: { key: string; hit: Promise<ParserLibEntry[]> } | null = null;

/** The parser library (Palo Alto, AWS ELB…) of the pack, or of the worker group when `pack` is null; used by the Parser “Library” picker. */
export function listParserLibrary(group: string, pack: PackId): Promise<ParserLibEntry[]> {
  const key = `${group}/${pack}`;
  if (parserLib?.key !== key) {
    const hit = request<Items<ParserLibEntry>>(`${scopeBase(group, pack)}/lib/parsers`)
      .then((d) => d.items ?? [])
      .catch(() => {
        parserLib = null;
        return [];
      });
    parserLib = { key, hit };
  }
  return parserLib.hit;
}

/** Group sample files, plus (with `pack`) the pack's own ones, marked `inPack` like Cribl's In Pack column. */
export async function listSamples(group: string, pack?: string): Promise<Sample[]> {
  const [grp, own] = await Promise.all([
    request<Items<Sample>>(`${api()}/m/${enc(group)}/system/samples`),
    pack ? request<Items<Sample>>(`${scopeBase(group, pack)}/system/samples`).catch(() => ({ items: [] }) as Items<Sample>) : null,
  ]);
  const seen = new Set((grp.items ?? []).map((s) => s.id));
  const packOnly = (own?.items ?? []).filter((s) => !seen.has(s.id)).map((s) => ({ ...s, inPack: true }));
  return [...packOnly, ...(grp.items ?? [])].sort((a, b) => (a.sampleName || a.id).localeCompare(b.sampleName || b.id));
}

/** Sample events; the pack-scoped path serves both pack and group samples. */
export async function getSampleContent(group: string, sampleId: string, pack?: string | null): Promise<CriblEvent[]> {
  const base = scopeBase(group, pack ?? null);
  const data = await request<CriblEvent[] | Items<CriblEvent>>(`${base}/system/samples/${enc(sampleId)}/content`);
  return Array.isArray(data) ? data : (data.items ?? []);
}

// Cribl answers a PATCH/DELETE of a pipeline that does not exist with 500
// "unknown pipeline id=…" rather than 404, so treat both as "missing".
export function isMissingPipeline(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || /unknown pipeline/i.test(err.message));
}

/** PATCH an existing pipeline; POST it if it does not exist yet (scratch only). */
async function writePipeline(group: string, pack: PackId, id: string, conf: PipelineConf, createIfMissing: boolean) {
  const body = JSON.stringify({ id, conf });
  try {
    await request(`${scopeBase(group, pack)}/pipelines/${enc(id)}`, { method: 'PATCH', body });
  } catch (err) {
    if (createIfMissing && isMissingPipeline(err)) {
      await request(`${scopeBase(group, pack)}/pipelines`, { method: 'POST', body });
      return;
    }
    throw err;
  }
}

export function savePipeline(group: string, pack: PackId, id: string, conf: PipelineConf) {
  return writePipeline(group, pack, id, conf, false);
}

export async function deleteScratchPipeline(group: string, pack: PackId) {
  try {
    await request(`${scopeBase(group, pack)}/pipelines/${enc(SCRATCH_PIPELINE_ID)}`, { method: 'DELETE' });
  } catch (err) {
    if (isMissingPipeline(err)) return;
    throw err;
  }
}

interface RawPreview {
  items?: CriblEvent[];
  stats?: { functions?: FunctionStats[] };
  stderr?: string;
  message?: string;
}

function stderrErrors(stderr = ''): string[] {
  const out: string[] = [];
  for (const line of stderr.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as { level?: string; message?: string; channel?: string; reason?: { message?: string } };
      // Leader-side config noise (feature flags, package refresh) is not about the pipeline.
      if (j.level === 'error' && !/^(ConfFeatureFlagsMgr|PackageDependencyMgr)$/.test(j.channel ?? '')) {
        out.push([j.message, j.reason?.message].filter(Boolean).join(': '));
      }
    } catch {
      /* non-JSON stderr lines are progress output */
    }
  }
  return out;
}

/** Write `conf` to the scratch pipeline and run the sample through it. */
export async function runPreview(group: string, pack: PackId, conf: PipelineConf, sampleId: string): Promise<PreviewResult> {
  await writePipeline(group, pack, SCRATCH_PIPELINE_ID, conf, true);
  const data = await request<RawPreview>(`${scopeBase(group, pack)}/preview`, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'pipe',
      pipelineId: SCRATCH_PIPELINE_ID,
      level: 3,
      sampleId,
      dropped: true,
      cpuProfile: false,
      enhanceMetricsOutput: false,
      timeout: 10000,
      memory: 2048,
    }),
  });
  const errors = stderrErrors(data.stderr);
  if (data.message) errors.unshift(data.message);
  return { events: data.items ?? [], stats: data.stats?.functions ?? [], errors };
}
