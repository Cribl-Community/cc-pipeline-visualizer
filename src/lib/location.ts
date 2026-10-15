/**
 * Where the user is (worker group, pack, pipeline), kept in the URL path so a link like
 * `/apps/a/cribl-pipeline-visualizer/groups/seLab/packs/my-pack/pipelines/main` opens that place.
 * The shape follows Cribl's own URLs:
 *
 * - `groups/<g>`: the pack picker of the group.
 * - `groups/<g>/packs/<pk>`: a pack's pipelines overview, `/pipelines/<pl>` added: that pipeline in the pack.
 * - `groups/<g>/pipelines`: the worker group's own pipelines, `/<pl>` added: one of them.
 *
 * It has to be the path: when the user goes Back, Cribl forwards only the pathname to the app's
 * iframe, so state in the query string would not come back. `?group=&pack=&pipeline=&source=group`
 * links are still read.
 */
export interface Place {
  group: string | null;
  /** Pack pipelines (Group → Pack → Pipeline) or the worker group's own (Group → Pipeline). */
  source: 'pack' | 'group';
  pack: string | null;
  pipeline: string | null;
}

const NOWHERE: Place = { group: null, source: 'pack', pack: null, pipeline: null };

const val = (q: URLSearchParams, k: string) => q.get(k)?.trim() || null;

function decode(s: string | undefined): string | null {
  if (!s) return null;
  try {
    return decodeURIComponent(s).trim() || null;
  } catch {
    return null;
  }
}

/** The legacy query-string form. */
export function parseQuery(search: string): Place {
  const q = new URLSearchParams(search);
  const pack = val(q, 'pack');
  const pipeline = val(q, 'pipeline');
  // A pipeline without a pack can only be one of the group's own.
  const source = pack ? 'pack' : q.get('source') === 'group' || pipeline ? 'group' : 'pack';
  return { group: val(q, 'group'), source, pack: source === 'pack' ? pack : null, pipeline };
}

/** `rest` is the path below the app's base path, e.g. `/groups/seLab/packs/pk`. */
export function parsePath(rest: string): Place {
  const s = rest.split('/').filter(Boolean);
  if (s[0] !== 'groups') return NOWHERE;
  const group = decode(s[1]);
  if (!group) return NOWHERE;
  if (s[2] === 'packs') {
    const pack = decode(s[3]);
    return { group, source: 'pack', pack, pipeline: pack && s[4] === 'pipelines' ? decode(s[5]) : null };
  }
  if (s[2] === 'pipelines') return { group, source: 'group', pack: null, pipeline: decode(s[3]) };
  return { ...NOWHERE, group };
}

/** The path wins; the query string is only read when the path names no group. */
export function parsePlace(base: string, pathname: string, search: string): Place {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const p = parsePath(rest);
  return p.group ? p : parseQuery(search);
}

/** The path below the base for `p`, `/` when there is no group. */
export function placePath(p: Place): string {
  if (!p.group) return '/';
  const e = encodeURIComponent;
  let path = `/groups/${e(p.group)}`;
  if (p.source === 'group') {
    path += '/pipelines';
    if (p.pipeline) path += `/${e(p.pipeline)}`;
  } else if (p.pack) {
    path += `/packs/${e(p.pack)}`;
    if (p.pipeline) path += `/pipelines/${e(p.pipeline)}`;
  }
  return path;
}

/** Same worker group and pack (or both the group's own pipelines): only the open pipeline differs. */
export const sameScope = (a: Place, b: Place) => a.group === b.group && a.source === b.source && a.pack === b.pack;

/** Lowercase with `_` and spaces as `-`, the way Cribl turns a pack's name into its id on install. */
const packKey = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, '-');

/**
 * The pack a link means. Links often carry the pack's display name (`CiscoFtd_CIM`) rather than
 * the id Cribl gave it on install (`ciscoftd-cim`), so after the id itself this tries the display
 * name, then both compared in Cribl's id form.
 */
export function findPack<T extends { id: string; displayName?: string }>(packs: T[], ref: string): T | undefined {
  const lc = ref.trim().toLowerCase();
  const k = packKey(ref);
  return (
    packs.find((p) => p.id === ref) ??
    packs.find((p) => p.id.toLowerCase() === lc) ??
    packs.find((p) => p.displayName?.trim().toLowerCase() === lc) ??
    packs.find((p) => packKey(p.id) === k || (!!p.displayName && packKey(p.displayName) === k))
  );
}
