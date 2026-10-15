import { useMemo, useState } from 'react';
import { CaretDownSolid, CaretRightSolid, Search } from '@capra/icons';
import { FUNCTION_SPECS, SPEC_BY_ID } from '../lib/functionSpecs';
import type { FunctionMeta } from '../lib/types';

// Cribl's category order in the Add Function menu.
const GROUP_ORDER = ['Standard', 'Formatters', 'Metrics', 'Advanced', 'Deprecated Functions'];
const rank = (g: string) => {
  const i = GROUP_ORDER.indexOf(g);
  return i < 0 ? GROUP_ORDER.length : i;
};

interface Props {
  catalog: FunctionMeta[];
  onPick: (functionId: string) => void;
}

/** Search box plus collapsible categories, like Cribl's Add Function dropdown. */
export function AddFunctionMenu({ catalog, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    // Before the catalogue loads, offer the hand-built forms so Add still works.
    const source: FunctionMeta[] = catalog.length ? catalog : FUNCTION_SPECS.map((s) => ({ id: s.id, name: s.name, group: 'Standard' }));
    const byGroup = new Map<string, FunctionMeta[]>();
    for (const f of source) {
      const g = f.group || 'Other';
      byGroup.set(g, [...(byGroup.get(g) ?? []), f]);
    }
    return [...byGroup.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([name, fns]) => ({ name, fns: fns.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [catalog]);

  const q = query.trim().toLowerCase();
  const toggle = (g: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <div className="afm">
      <label className="afm-search">
        <Search />
        <input autoFocus placeholder="Search" value={query} aria-label="Search functions" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="afm-tree" role="tree">
        {groups.map((g) => {
          const fns = q ? g.fns.filter((f) => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)) : g.fns;
          if (q && !fns.length) return null;
          const expanded = !!q || open.has(g.name);
          return (
            <div key={g.name} role="treeitem" aria-expanded={expanded}>
              <button type="button" className="afm-grp" onClick={() => toggle(g.name)}>
                <span className="afm-caret">{expanded ? <CaretDownSolid /> : <CaretRightSolid />}</span>
                {g.name}
              </button>
              {expanded &&
                fns.map((f) => (
                  <button key={f.id} type="button" className="afm-fn" onClick={() => onPick(f.id)} title={f.id}>
                    {f.name}
                    {!f.schema && !SPEC_BY_ID.has(f.id) && <span className="afm-json">JSON</span>}
                  </button>
                ))}
            </div>
          );
        })}
        {q && groups.every((g) => !g.fns.some((f) => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q))) && (
          <div className="afm-none">No functions match “{query}”.</div>
        )}
      </div>
    </div>
  );
}
