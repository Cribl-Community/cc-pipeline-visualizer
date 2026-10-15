import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Modal, SelectField, Spinner, Toast, ToggleButtonGroup } from '@capra/core';
import { AddFunctionButton, FunctionList, type Row } from './components/FunctionList';
import { ArrowLeft, BracketsCurly, ChevronRight, MessagePlus } from '@capra/icons';
import { PipelineOverview, type StatsState } from './components/PipelineOverview';
import { PreviewPane, type FocusInfo } from './components/PreviewPane';
import { FormContext } from './components/formContext';
import { Landing } from './components/Landing';
import type { ViewMode } from './components/EventView';
import {
  SCRATCH_PIPELINE_ID,
  type PackId,
  deleteScratchPipeline,
  getPipeline,
  getSampleContent,
  listFunctions,
  listInputs,
  listPacks,
  listPipelines,
  listRoutes,
  listSamples,
  listWorkerGroups,
  pipelineStats,
  runPreview,
  savePipeline,
} from './lib/api';
import { SPEC_BY_ID } from './lib/functionSpecs';
import { findPack, parsePlace, placePath, sameScope, type Place } from './lib/location';
import { overviewRows } from './lib/overview';
import { defaultsFor, type JSONSchema } from './lib/schemaForm';
import { activeIndexes, isActive, newFunction, previewKey, sliceConf, statsIndex } from './lib/pipeline';
import type { ConfigGroup, CriblEvent, FunctionMeta, Input, Pack, PipeStats, Pipeline, PipelineConf, PipelineFunction, PreviewResult, Route, Sample } from './lib/types';
import './App.css';

/** “Display name (id)”, or just the id when the pack has no separate name. */
const packName = (p: Pack) => (p.displayName && p.displayName !== p.id ? `${p.displayName} (${p.id})` : p.id);

const SPLIT_DEFAULT = 52;
// How long to wait at startup inside Cribl for the link's path (it arrived after ~300 ms in tests).
const START_NAV_WAIT_MS = 1000;
const clampSplit = (v: number) => Math.min(80, Math.max(25, v));

type Scope = 'pipe' | 'fn';
type BaseConf = Omit<PipelineConf, 'functions'>;

interface Confirm {
  title: string;
  body: ReactNode;
  confirmText: string;
  run: () => Promise<void> | void;
}

interface Slot {
  inConf: PipelineConf;
  outConf: PipelineConf;
  inKey: string;
  outKey: string;
  statsAt: number | null;
}

interface Shown {
  scope: Scope;
  focusKey: string | null;
  inKey: string;
  outKey: string;
  in: PreviewResult;
  out: PreviewResult;
  statsAt: number | null;
}

let keySeq = 0;
const nextKey = () => `f${++keySeq}`;
const toRows = (fns: PipelineFunction[]): Row[] => fns.map((fn) => ({ key: nextKey(), fn }));
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `/app-ui/<app>` inside Cribl, empty in standalone dev. */
const basePath = () => (window.CRIBL_BASE_PATH ?? '').replace(/\/+$/, '');
const readPlace = () => parsePlace(basePath(), window.location.pathname, window.location.search);

/** The two pipeline cuts whose outputs are shown as IN and OUT. */
function makeSlot(conf: PipelineConf, scope: Scope, focusIndex: number, cacheScope: string, sampleId: string): Slot | null {
  if (scope === 'fn') {
    if (focusIndex < 0) return null;
    const inConf = sliceConf(conf, focusIndex);
    const outConf = sliceConf(conf, focusIndex + 1);
    return {
      inConf,
      outConf,
      inKey: cacheScope + previewKey(inConf, sampleId),
      outKey: cacheScope + previewKey(outConf, sampleId),
      statsAt: isActive(conf.functions[focusIndex], conf) ? statsIndex(conf, focusIndex) : null,
    };
  }
  const inConf = sliceConf(conf, 0);
  return { inConf, outConf: conf, inKey: cacheScope + previewKey(inConf, sampleId), outKey: cacheScope + previewKey(conf, sampleId), statsAt: null };
}

export default function App() {
  const [groups, setGroups] = useState<ConfigGroup[]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [pack, setPack] = useState<string | null>(null);
  // Pack pipeline (Group → Pack → Pipeline) or a worker group's own pipeline (Group → Pipeline).
  const [usePack, setUsePack] = useState(true);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<FunctionMeta[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [sampleEvents, setSampleEvents] = useState<CriblEvent[] | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  // Pipelines overview: what each pipeline is wired to, and its last-15-minute event counts.
  const [routes, setRoutes] = useState<Route[]>([]);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [wiringError, setWiringError] = useState<string | null>(null);
  const [stats, setStats] = useState<Map<string, PipeStats> | null>(null);
  const [statsState, setStatsState] = useState<StatsState>(null);
  // The place from the link (…/groups/seLab/packs/my-pack[/pipelines/main]) has been opened, or
  // the default group picked. Until then the URL is left alone and popstate is handled by startup.
  const [started, setStarted] = useState(false);
  // Start screen; shown when the app opens without a place in the link, left once a source is picked.
  const [landing, setLanding] = useState(true);

  const [base, setBase] = useState<BaseConf | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [original, setOriginal] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState('');

  const [scope, setScope] = useState<Scope>('fn');
  const [view, setView] = useState<ViewMode>('split');
  const [tab, setTab] = useState<'sample' | 'preview'>('preview');
  const [showInternal, setShowInternal] = useState(false);
  const [showDropped, setShowDropped] = useState(true);

  const [loading, setLoading] = useState<string | null>('Loading worker groups…');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [hasRun, setHasRun] = useState(false);
  // Packs where the user agreed to the scratch pipeline being written (this session only).
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Pack whose API paths to use; null means the worker group's own paths (`/m/<group>/…`).
  const where: PackId = usePack ? pack : null;
  const ready = !!group && (!usePack || !!pack);
  const formCtx = useMemo(() => ({ group, pack: where, pipelines: pipelines.map((p) => p.id).filter((id) => id !== SCRATCH_PIPELINE_ID) }), [group, where, pipelines]);

  // Async-only bookkeeping; never read during render.
  // Width of the pipeline pane in %, dragged with the divider like Cribl's split view.
  const [split, setSplit] = useState(SPLIT_DEFAULT);
  const mainRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, PreviewResult>());
  const inflightRef = useRef(new Map<string, Promise<PreviewResult>>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const sampleCacheRef = useRef(new Map<string, CriblEvent[]>());
  // `group/pack` whose pipelines are loaded; late overview responses for another scope are dropped.
  const scopeRef = useRef('');
  // Pipeline in the URL at the last write; opening or leaving a pipeline adds a history entry.
  const urlPipelineRef = useRef<string | null>(null);
  // Start screen showing at the last write; leaving or returning to it adds a history entry too.
  const urlLandingRef = useRef(true);
  // Latest openGroup call; packs of an earlier group that arrive late are dropped.
  const groupReqRef = useRef(0);
  // Latest preview run; results of earlier runs that finish later are dropped.
  const runReqRef = useRef(0);

  const conf = useMemo<PipelineConf | null>(() => (base ? { ...base, functions: rows.map((r) => r.fn) } : null), [base, rows]);
  const confJson = useMemo(() => (conf ? JSON.stringify(conf) : ''), [conf]);
  const dirty = !!conf && confJson !== original;
  const focusIndex = rows.findIndex((r) => r.key === focusKey);
  const packKey = ready ? `${group}/${where ?? ''}` : '';
  const cacheScope = `${packKey}|`;

  const slot = useMemo(() => (conf && sampleId ? makeSlot(conf, scope, focusIndex, cacheScope, sampleId) : null), [conf, scope, focusIndex, cacheScope, sampleId]);
  const display = shown && shown.scope === scope && (scope === 'pipe' || shown.focusKey === focusKey) ? shown : null;
  const stale = !!display && !!slot && (display.inKey !== slot.inKey || display.outKey !== slot.outKey);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const gs = await listWorkerGroups();
      if (cancelled) return;
      setGroups(gs);
      let pl = readPlace();
      // Inside Cribl the iframe always loads at the app's base path; the link's path follows a
      // moment later as a popstate (CRIBL_NAV). Wait for it before falling back to the default group.
      if (!pl.group && window.parent !== window) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            window.removeEventListener('popstate', done);
            resolve();
          };
          const timer = setTimeout(done, START_NAV_WAIT_MS);
          window.addEventListener('popstate', done);
        });
        if (cancelled) return;
        pl = readPlace();
      }
      setLoading(null);
      setStarted(true);
      if (!pl.group) return;
      setLanding(false);
      void applyPlace(pl, gs);
    };
    start()
      .catch((err) => {
        if (cancelled) return;
        setLoading(null);
        setLoadError(`Could not load worker groups. ${message(err)}`);
      });
    return () => {
      cancelled = true;
    };
    // openGroup/applyPlace are plain functions over setters; running this once on mount is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the place in the URL path; Cribl copies it to the parent URL bar. Opening or
  // leaving a pipeline adds a history entry, so browser Back returns to the pipelines overview.
  const place: Place = { group, source: usePack ? 'pack' : 'group', pack: usePack ? pack : null, pipeline: pipelineId };
  const placeUrl = `${basePath()}${placePath(place)}`;
  useEffect(() => {
    if (!started) return;
    // Also drops a legacy ?group=… query once it has been read.
    if (placeUrl !== window.location.pathname || window.location.search) {
      const url = `${placeUrl}${window.location.hash}`;
      if (pipelineId !== urlPipelineRef.current || landing !== urlLandingRef.current) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    }
    urlPipelineRef.current = pipelineId;
    urlLandingRef.current = landing;
  }, [started, placeUrl, pipelineId, landing]);

  const onPopState = useEffectEvent(() => {
    if (!started) return;
    const next = readPlace();
    if (placePath(next) === placePath(place)) return;
    const go = () => {
      if (!next.group) return goHome();
      setLanding(false);
      if (ready && sameScope(next, place)) return next.pipeline ? void openPipeline(next.pipeline) : closePipeline();
      void applyPlace(next);
    };
    if (!dirty) return go();
    // Keep the URL on the edited pipeline until the user agrees to discard the edits.
    window.history.pushState(null, '', `${placeUrl}${window.location.hash}`);
    guard(go);
  });
  useEffect(() => {
    const h = () => onPopState();
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  // ---- navigation -----------------------------------------------------------------

  function guard(action: () => void) {
    if (!dirty) return action();
    setConfirm({
      title: 'Discard unsaved changes?',
      body: (
        <p>
          You have unsaved edits to <b>{pipelineId}</b>. Leaving this pipeline discards them.
        </p>
      ),
      confirmText: 'Discard changes',
      run: action,
    });
  }

  function clearPipeline() {
    setPipelineId(null);
    setBase(null);
    setRows([]);
    setOriginal('');
    setExpanded(new Set());
    setFocusKey(null);
    setShown(null);
    setHasRun(false);
    runReqRef.current++;
    setRunning(false);
    setRunError(null);
    setJsonMode(false);
  }

  /** From the start screen: pack pipelines or the worker group's own, in the default group when there is one. */
  function pickSource(packMode: boolean) {
    setUsePack(packMode);
    setLanding(false);
    const pick = groups.find((g) => g.id === 'default') ?? (groups.length === 1 ? groups[0] : undefined);
    if (pick) void openGroup(pick.id, packMode);
  }

  /** Back to the start screen, closing the worker group. */
  function goHome() {
    groupReqRef.current++;
    scopeRef.current = '';
    clearPipeline();
    setGroup(null);
    setPack(null);
    setPacks([]);
    setPipelines([]);
    setLoadError(null);
    setLoading(null);
    setLanding(true);
  }

  /** Opens a worker group; in pack mode resolves to its packs (null on error). */
  async function openGroup(id: string, packMode = usePack): Promise<Pack[] | null> {
    const req = ++groupReqRef.current;
    scopeRef.current = '';
    setGroup(id);
    setPack(null);
    setPacks([]);
    setPipelines([]);
    setSamples([]);
    setSampleId(null);
    setSampleEvents(null);
    clearPipeline();
    setLoadError(null);
    if (!packMode) {
      await loadPipelines(id, null);
      return null;
    }
    setLoading('Loading packs…');
    try {
      const [ps, ss] = await Promise.all([listPacks(id), listSamples(id).catch(() => [] as Sample[])]);
      if (req !== groupReqRef.current) return null;
      setPacks(ps);
      setSamples(ss);
      return ps;
    } catch (err) {
      if (req === groupReqRef.current) setLoadError(`Could not load packs for ${id}. ${message(err)}`);
      return null;
    } finally {
      if (req === groupReqRef.current) setLoading(null);
    }
  }

  function openPack(id: string, g = group) {
    if (!g) return;
    setPack(id);
    return loadPipelines(g, id);
  }

  /**
   * Opens a place from a link or from browser history: worker group, then pack, then pipeline.
   * The pack may be given by id or display name, in any case (see findPack).
   */
  async function applyPlace(pl: Place, gs: ConfigGroup[] = groups) {
    const g = gs.find((x) => x.id === pl.group) ?? gs.find((x) => x.id.toLowerCase() === pl.group?.toLowerCase());
    if (!g) {
      setLoadError(`Worker group ${pl.group} was not found.`);
      return;
    }
    const packMode = pl.source === 'pack';
    setUsePack(packMode);
    const opening = openGroup(g.id, packMode);
    // Another group was opened meanwhile (e.g. browser Back during the load): stop here.
    const req = groupReqRef.current;
    const ps = await opening;
    if (req !== groupReqRef.current) return;
    let pk: string | null = null;
    if (packMode) {
      if (!pl.pack || !ps) return;
      pk = findPack(ps, pl.pack)?.id ?? null;
      if (!pk) {
        setLoadError(`Pack ${pl.pack} was not found in worker group ${g.id}.`);
        return;
      }
      await openPack(pk, g.id);
      if (req !== groupReqRef.current) return;
    }
    if (pl.pipeline) await openPipeline(pl.pipeline, g.id, pk);
  }

  /** Switches between pack pipelines and the worker group's own pipelines. */
  function changeSource(packMode: boolean) {
    setUsePack(packMode);
    if (group) void openGroup(group, packMode);
  }

  /** Pipelines, function catalogue and samples of a pack, or of the worker group itself when `pk` is null. */
  async function loadPipelines(g: string, pk: PackId) {
    const scope = `${g}/${pk ?? ''}`;
    scopeRef.current = scope;
    setPipelines([]);
    setCatalog([]);
    setRoutes([]);
    setInputs([]);
    setWiringError(null);
    clearPipeline();
    setLoadError(null);
    setLoading('Loading pipelines…');
    refreshStats(g, pk);
    try {
      const [pl, fns, ss, wiring] = await Promise.all([
        listPipelines(g, pk),
        listFunctions(g, pk).catch(() => [] as FunctionMeta[]),
        listSamples(g, pk ?? undefined).catch(() => null),
        Promise.all([listRoutes(g, pk), listInputs(g, pk)]).catch((err: unknown) => new Error(message(err))),
      ]);
      if (scopeRef.current !== scope) return;
      setPipelines(pl);
      setCatalog(fns);
      if (wiring instanceof Error) setWiringError(wiring.message);
      else {
        setRoutes(wiring[0]);
        setInputs(wiring[1]);
      }
      if (ss) {
        setSamples(ss);
        // Like Cribl, start with the pack's own sample when there is one.
        const keep = ss.some((s) => s.id === sampleId) ? sampleId : (ss.find((s) => s.inPack)?.id ?? (pk ? null : (ss[0]?.id ?? null)));
        if (keep !== sampleId) {
          setSampleId(keep);
          setSampleEvents(null);
        }
      }
    } catch (err) {
      setLoadError(`Could not load pipelines in ${pk ?? g}. ${message(err)}`);
    } finally {
      setLoading(null);
    }
  }

  /** Event counts per pipeline for the overview's Stats column; failures only mark the column unavailable. */
  function refreshStats(g = group, pk = where) {
    if (!g) return;
    const scope = `${g}/${pk ?? ''}`;
    setStatsState(null);
    pipelineStats(g, pk)
      .then((m) => {
        if (scopeRef.current !== scope) return;
        setStats(m);
        setStatsState('ok');
      })
      .catch((err: unknown) => {
        if (scopeRef.current !== scope) return;
        setStats(null);
        setStatsState(message(err));
      });
  }

  /** Back to the pipelines overview, with fresh stats. */
  function closePipeline() {
    clearPipeline();
    refreshStats();
  }

  async function openPipeline(id: string, g = group, pk = where) {
    if (!g) return;
    clearPipeline();
    setPipelineId(id);
    setLoadError(null);
    setLoading('Loading pipeline…');
    try {
      const p = await getPipeline(g, pk, id);
      loadConf(p.conf);
    } catch (err) {
      setLoadError(`Could not open pipeline ${id}. ${message(err)}`);
      setPipelineId(null);
    } finally {
      setLoading(null);
    }
  }

  function loadConf(c: PipelineConf, markSaved = true) {
    const { functions, ...rest } = c;
    const fns = functions ?? [];
    const next = toRows(fns);
    setBase(rest);
    setRows(next);
    if (markSaved) setOriginal(JSON.stringify({ ...rest, functions: fns }));
    setExpanded(new Set());
    // The preview opens on “Before & after one function”, starting at the first active one.
    const first = activeIndexes({ ...rest, functions: fns })[0];
    setFocusKey(first === undefined ? null : next[first].key);
  }

  async function chooseSample(id: string) {
    setSampleId(id);
    if (hasRun && conf) void run(makeSlot(conf, scope, focusIndex, cacheScope, id), scope, focusKey, id);
  }

  // Load the chosen sample's events (shown as IN before the first run).
  useEffect(() => {
    if (!group || !sampleId) return;
    const cached = sampleCacheRef.current.get(sampleId);
    if (cached) {
      setSampleEvents(cached);
      return;
    }
    let cancelled = false;
    setSampleLoading(true);
    setSampleEvents(null);
    getSampleContent(group, sampleId, where)
      .then((evs) => {
        sampleCacheRef.current.set(sampleId, evs);
        if (!cancelled) setSampleEvents(evs);
      })
      .catch((err: unknown) => !cancelled && Toast.error(`Could not load sample: ${message(err)}`))
      .finally(() => !cancelled && setSampleLoading(false));
    return () => {
      cancelled = true;
      setSampleLoading(false);
    };
  }, [group, where, sampleId]);

  // ---- preview --------------------------------------------------------------------

  /** One preview at a time: every run rewrites the same scratch pipeline. */
  function ensure(c: PipelineConf, key: string, sId: string): Promise<PreviewResult> {
    const hit = cacheRef.current.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = inflightRef.current.get(key);
    if (pending) return pending;
    const g = group!;
    const pk = where;
    const p = queueRef.current.then(() => runPreview(g, pk, c, sId));
    queueRef.current = p.catch(() => undefined);
    inflightRef.current.set(key, p);
    return p
      .then((res) => {
        cacheRef.current.set(key, res);
        return res;
      })
      .finally(() => inflightRef.current.delete(key));
  }

  async function run(s: Slot | null, sc: Scope, fk: string | null, sId: string | null) {
    if (!s || !sId || !group || !ready) return;
    // Clicking through functions starts a run per click; only the latest one is shown.
    const req = ++runReqRef.current;
    setRunning(true);
    setRunError(null);
    try {
      const [a, b] = await Promise.all([ensure(s.inConf, s.inKey, sId), ensure(s.outConf, s.outKey, sId)]);
      if (req !== runReqRef.current) return;
      setShown({ scope: sc, focusKey: fk, inKey: s.inKey, outKey: s.outKey, in: a, out: b, statsAt: s.statsAt });
      setHasRun(true);
    } catch (err) {
      if (req === runReqRef.current) setRunError(message(err));
    } finally {
      if (req === runReqRef.current) setRunning(false);
    }
  }

  function onRun() {
    if (slot) void run(slot, scope, focusKey, sampleId);
  }

  /** Run the preview after the user picks another function or scope, as if they pressed Run. */
  function autoRun(sc: Scope, fk: string | null) {
    if (!conf || !sampleId) return;
    const idx = rows.findIndex((r) => r.key === fk);
    void run(makeSlot(conf, sc, idx, cacheScope, sampleId), sc, fk, sampleId);
  }

  function selectFocus(key: string, sc: Scope = scope) {
    setFocusKey(key);
    autoRun(sc, key);
  }

  function changeScope(sc: Scope) {
    setScope(sc);
    let fk = focusKey;
    if (sc === 'fn' && !fk && conf) {
      const first = activeIndexes(conf)[0];
      if (first !== undefined) {
        fk = rows[first].key;
        setFocusKey(fk);
      }
    }
    autoRun(sc, fk);
  }

  function step(dir: -1 | 1) {
    if (!conf || focusIndex < 0) return;
    const act = activeIndexes(conf);
    const target = dir > 0 ? act.find((i) => i > focusIndex) : [...act].reverse().find((i) => i < focusIndex);
    if (target !== undefined) selectFocus(rows[target].key);
  }

  function removeScratch() {
    if (!group || !ready) return;
    const from = where ? (
      <>
        pack <b>{where}</b>
      </>
    ) : (
      <>
        worker group <b>{group}</b>
      </>
    );
    setConfirm({
      title: 'Remove preview pipeline?',
      body: (
        <p>
          This deletes the scratch pipeline <code>{SCRATCH_PIPELINE_ID}</code> from {from}. Your edits in this app are kept; the next Run creates it again.
        </p>
      ),
      confirmText: 'Remove',
      run: async () => {
        try {
          await deleteScratchPipeline(group, where);
          cacheRef.current.clear();
          setHasRun(false);
          Toast.success(`Removed ${SCRATCH_PIPELINE_ID} from ${where ?? group}.`);
        } catch (err) {
          Toast.error(`Could not remove the preview pipeline: ${message(err)}`);
        }
      },
    });
  }

  // ---- editing --------------------------------------------------------------------

  const updateRow = (key: string, fn: PipelineFunction) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, fn } : r)));

  function moveRow(from: number, to: number) {
    setRows((rs) => {
      const next = [...rs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function duplicateRow(key: string) {
    const copy: Row = { key: nextKey(), fn: structuredClone(rows.find((r) => r.key === key)!.fn) };
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
    });
  }

  function deleteRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    if (focusKey === key) setFocusKey(null);
  }

  /** Insert a new function (or comment) at position `at`; defaults to after the focus, else the end. */
  function addFunction(id: string, at?: number) {
    // Cribl's own schema defaults (including dependency branches), like Cribl's Add Function.
    const schema = catalog.find((f) => f.id === id)?.schema as JSONSchema | undefined;
    const defaults = schema ? defaultsFor(schema) : (SPEC_BY_ID.get(id)?.defaults ?? {});
    const fn = newFunction(id, defaults);
    if (id === 'comment') delete fn.filter;
    const row: Row = { key: nextKey(), fn };
    setRows((rs) => {
      const pos = at ?? (scope === 'fn' && focusIndex >= 0 ? focusIndex + 1 : rs.length);
      return [...rs.slice(0, pos), row, ...rs.slice(pos)];
    });
    setExpanded((s) => new Set(s).add(row.key));
  }

  function toggleExpand(key: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (scope === 'fn' && key !== focusKey) selectFocus(key);
  }

  function inspect(key: string) {
    setTab('preview');
    setScope('fn');
    selectFocus(key, 'fn');
  }

  function openJson() {
    setJsonDraft(JSON.stringify(conf, null, 2));
    setJsonError('');
    setJsonMode(true);
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonDraft) as PipelineConf;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.functions)) throw new Error('Expected an object with a "functions" array.');
      loadConf(parsed, false);
      setJsonMode(false);
    } catch (err) {
      setJsonError(message(err));
    }
  }

  async function save() {
    if (!conf || !group || !ready || !pipelineId) return;
    const snapshot = conf;
    try {
      await savePipeline(group, where, pipelineId, snapshot);
      setOriginal(JSON.stringify(snapshot));
      setPipelines((ps) => ps.map((p) => (p.id === pipelineId ? { ...p, conf: snapshot } : p)));
      Toast.success(`Saved ${pipelineId}. Commit and deploy in Cribl to make it live.`);
    } catch (err) {
      Toast.error(`Save failed: ${message(err)}`);
    }
  }

  function revert() {
    setConfirm({
      title: 'Revert all changes?',
      body: <p>This discards every edit since the pipeline was opened or last saved.</p>,
      confirmText: 'Revert',
      run: () => loadConf(JSON.parse(original) as PipelineConf),
    });
  }

  // ---- render ---------------------------------------------------------------------

  const focusFn = focusIndex >= 0 ? rows[focusIndex].fn : null;
  const act = conf ? activeIndexes(conf) : [];
  const focus: FocusInfo | null =
    focusFn && conf
      ? {
          index: focusIndex,
          name: catalog.find((f) => f.id === focusFn.id)?.name ?? SPEC_BY_ID.get(focusFn.id)?.name ?? focusFn.id,
          description: focusFn.description,
          active: isActive(focusFn, conf),
          canPrev: act.some((i) => i < focusIndex),
          canNext: act.some((i) => i > focusIndex),
        }
      : null;
  const errors = [...(runError ? [runError] : []), ...(display?.out.errors ?? [])];
  const openPackMeta = packs.find((p) => p.id === pack);
  const packLabel = openPackMeta ? packName(openPackMeta) : pack;
  const overview = useMemo(() => overviewRows(pipelines, routes, inputs, stats), [pipelines, routes, inputs, stats]);

  if (landing)
    return (
      <div className="app">
        <Toast.Provider />
        {loadError && (
          <div className="banner">
            <Alert appearance="danger" title="Something went wrong">
              {loadError}
            </Alert>
          </div>
        )}
        {started ? (
          <Landing onPick={pickSource} />
        ) : (
          loading && (
            <div className="welcome mut loading">
              <Spinner size="sm" /> {loading}
            </div>
          )
        )}
      </div>
    );

  return (
    <div className="app">
      <Toast.Provider />
      <div className="top">
        <button type="button" className="title" title="Back to the start screen" onClick={() => guard(goHome)}>
          Pipeline Visualizer
        </button>
        <div className="crumbs">
          <div className="crumb-f src">
            <span className="crumb-l">Source</span>
            <div className="src-tg">
              <ToggleButtonGroup
                aria-label="Source"
                size="md"
                disallowEmptySelection
                selectedKeys={[usePack ? 'pack' : 'group']}
                onSelectionChange={(keys) => {
                  const packMode = keys.has('pack');
                  if (packMode !== usePack) guard(() => changeSource(packMode));
                }}
                items={[
                  { key: 'pack', text: 'Packs', tooltip: 'Pipelines inside a pack' },
                  { key: 'group', text: 'Pipelines', tooltip: 'The worker group’s own pipelines' },
                ]}
              />
            </div>
          </div>
          <div className="crumb-f grp">
            <span className="crumb-l">Worker group</span>
            <div className="sel-wrap" title={group ?? undefined}>
              <SelectField
                aria-label="Worker group"
                size="sm"
                placeholder="Select a worker group"
                value={group}
                onChange={(k) => k !== null && k !== group && guard(() => void openGroup(String(k)))}
                items={groups.map((g) => ({ id: g.id, label: g.id }))}
              />
            </div>
          </div>
          {usePack && (
            <>
              <span className="sep">
                <ChevronRight />
              </span>
              <div className="crumb-f pk">
                <span className="crumb-l">Pack</span>
                <div className="sel-wrap" title={packLabel ?? undefined}>
                  <SelectField
                    aria-label="Pack"
                    size="sm"
                    canSearch
                    placeholder={group ? (packs.length ? 'Select a pack' : 'No packs') : 'Select a pack'}
                    disabled={!group || !packs.length}
                    value={pack}
                    onChange={(k) => k !== null && k !== pack && guard(() => void openPack(String(k)))}
                    items={packs.map((p) => ({ id: p.id, label: packName(p) }))}
                  />
                </div>
              </div>
            </>
          )}
          <span className="sep">
            <ChevronRight />
          </span>
          <div className="crumb-f pl">
            <span className="crumb-l">Pipeline</span>
            <div className="sel-wrap" title={pipelineId ?? undefined}>
              <SelectField
                aria-label="Pipeline"
                size="sm"
                canSearch
                placeholder={ready && !loading ? (pipelines.length ? 'Select a pipeline' : 'No pipelines') : 'Select a pipeline'}
                disabled={!ready || !pipelines.length}
                value={pipelineId}
                onChange={(k) => k !== null && k !== pipelineId && guard(() => void openPipeline(String(k)))}
                items={pipelines.map((p) => ({ id: p.id, label: p.id }))}
              />
            </div>
          </div>
        </div>
        {dirty && <span className="badge">Unsaved changes</span>}
        {loading && (
          <span className="mut loading">
            <Spinner size="sm" /> {loading}
          </span>
        )}
        <span className="spacer" />
      </div>

      {loadError && (
        <div className="banner">
          <Alert appearance="danger" title="Something went wrong">
            {loadError}
          </Alert>
        </div>
      )}

      {!conf && ready && !pipelineId ? (
        <PipelineOverview
          key={packKey}
          rows={overview}
          scopeLabel={usePack ? `pack ${packLabel}` : `worker group ${group}`}
          loading={!!loading}
          wiringError={wiringError}
          stats={statsState}
          onRefreshStats={() => refreshStats()}
          onOpen={(id) => void openPipeline(id)}
        />
      ) : !conf ? (
        <div className="welcome">
          {!loading && !pipelineId && (
            <>
              <h2>{usePack ? 'Open a pack' : 'Open a pipeline'}</h2>
              <p>
                {usePack ? 'Pick a worker group and a pack to see its pipelines, then open one.' : 'Pick a worker group to see its pipelines, then open one.'} Edit its functions on the left, run a
                sample through it on the right, or select a single function to see the data just before and just after it.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="main" ref={mainRef} style={{ gridTemplateColumns: `minmax(0, ${split}%) 7px minmax(0, 1fr)` }}>
          <div className="left">
            <div className="bar">
              <button type="button" className="back" title="Back to all pipelines" onClick={() => guard(closePipeline)}>
                <ArrowLeft /> Pipelines
              </button>
              <div className="cnt">
                <span>
                  <b>{rows.length}</b> Functions
                </span>
                <span>
                  <b>{act.length}</b> Active
                </span>
                {conf.output && <span title="Output destination">Output: {conf.output}</span>}
              </div>
              <span className="spacer" />
              {!jsonMode && <AddFunctionButton catalog={catalog} onPick={(id) => addFunction(id)} />}
              {!jsonMode && (
                <button type="button" className="tb" title="Insert comment" aria-label="Insert comment" onClick={() => addFunction('comment', rows.length)}>
                  <MessagePlus />
                </button>
              )}
              <button
                type="button"
                className={`tb${jsonMode ? ' on' : ''}`}
                title={jsonMode ? 'Back to functions' : 'Manage as JSON'}
                aria-label={jsonMode ? 'Back to functions' : 'Manage as JSON'}
                onClick={() => (jsonMode ? setJsonMode(false) : openJson())}
              >
                <BracketsCurly />
              </button>
            </div>
            {jsonMode ? (
              <div className="json-edit">
                <textarea className="in mono" value={jsonDraft} aria-label="Pipeline JSON" onChange={(e) => setJsonDraft(e.target.value)} />
                {jsonError && <div className="err-text">{jsonError}</div>}
                <div className="json-actions">
                  <Button variant="primary" size="sm" onClick={applyJson}>
                    Apply JSON
                  </Button>
                  <span className="hint">Applies to the editor only. Use Save to write it to Cribl.</span>
                </div>
              </div>
            ) : (
              <FormContext.Provider value={formCtx}>
                <FunctionList
                  rows={rows}
                  conf={conf}
                  catalog={catalog}
                  expanded={expanded}
                  focusKey={focusKey}
                  scope={scope}
                  onToggleExpand={toggleExpand}
                  onInspect={inspect}
                  onChange={updateRow}
                  onMove={moveRow}
                  onDuplicate={duplicateRow}
                  onDelete={deleteRow}
                  onInsert={(at, id) => addFunction(id, at)}
                  onExpandAll={(open) => setExpanded(open ? new Set(rows.map((r) => r.key)) : new Set())}
                />
              </FormContext.Provider>
            )}
            {/* Cribl keeps Cancel / Save at the bottom right of the pipeline editor. */}
            <div className="left-foot">
              <Button variant="secondary" disabled={!dirty} onClick={revert}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!dirty} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
          <div
            className="splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            aria-valuemin={25}
            aria-valuemax={80}
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            title="Drag to resize; double-click to reset"
            onPointerDown={(e) => {
              const box = mainRef.current?.getBoundingClientRect();
              if (!box) return;
              e.preventDefault();
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              document.body.classList.add('resizing');
              // Keep at least 420px for the function list and 380px for the preview.
              const lo = Math.max(25, (420 / box.width) * 100);
              const hi = Math.min(80, 100 - (380 / box.width) * 100);
              const move = (ev: PointerEvent) => setSplit(Math.min(hi, Math.max(lo, ((ev.clientX - box.left) / box.width) * 100)));
              const up = () => {
                el.removeEventListener('pointermove', move);
                el.removeEventListener('pointerup', up);
                el.removeEventListener('pointercancel', up);
                document.body.classList.remove('resizing');
              };
              el.addEventListener('pointermove', move);
              el.addEventListener('pointerup', up);
              el.addEventListener('pointercancel', up);
            }}
            onDoubleClick={() => setSplit(SPLIT_DEFAULT)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                setSplit((v) => clampSplit(v + (e.key === 'ArrowLeft' ? -2 : 2)));
              }
            }}
          />
          <PreviewPane
            tab={tab}
            onTab={(t) => {
              setTab(t);
            }}
            samples={samples}
            sampleId={sampleId}
            onSample={(id) => void chooseSample(id)}
            sampleEvents={sampleEvents}
            sampleLoading={sampleLoading}
            scope={scope}
            onScope={changeScope}
            view={view}
            onView={setView}
            showInternal={showInternal}
            onShowInternal={setShowInternal}
            showDropped={showDropped}
            onShowDropped={setShowDropped}
            canRun={!!slot && !running}
            running={running}
            stale={stale}
            onRun={onRun}
            focus={focus}
            onStep={step}
            result={display ? { in: display.in.events, out: display.out.events } : null}
            stats={display && display.statsAt !== null ? display.out.stats[display.statsAt] : undefined}
            errors={errors}
            onRemoveScratch={removeScratch}
          />
        </div>
      )}

      <Modal
        isOpen={!!confirm}
        onIsOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title}
        confirmButtonText={confirm?.confirmText}
        cancelButtonText="Cancel"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          await c?.run();
        }}
      >
        {confirm?.body}
      </Modal>
    </div>
  );
}
