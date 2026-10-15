import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bullseye, CaretDownSolid, CollapseAllOutlined, ExpandAllOutlined, Copy, Ellipsis, Eye, EyeInvisible, GripDotsVertical, Message, Trash } from '@capra/icons';
import { AddFunctionMenu } from './AddFunctionMenu';
import { FunctionForm } from './FunctionForm';
import { Js, Popover, Toggle } from './ui';
import { SPEC_BY_ID } from '../lib/functionSpecs';
import { isActive } from '../lib/pipeline';
import type { FunctionMeta, PipelineConf, PipelineFunction } from '../lib/types';

export interface Row {
  key: string;
  fn: PipelineFunction;
}

interface Props {
  rows: Row[];
  conf: PipelineConf;
  catalog: FunctionMeta[];
  expanded: Set<string>;
  focusKey: string | null;
  scope: 'pipe' | 'fn';
  onToggleExpand: (key: string) => void;
  onInspect: (key: string) => void;
  onChange: (key: string, fn: PipelineFunction) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
  onInsert: (at: number, functionId: string) => void;
  onExpandAll: (open: boolean) => void;
}

export function FunctionList(p: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const byId = useMemo(() => new Map(p.catalog.map((f) => [f.id, f])), [p.catalog]);
  const allOpen = p.rows.length > 0 && p.rows.every((r) => p.expanded.has(r.key));
  const focusIndex = p.scope === 'fn' ? p.rows.findIndex((r) => r.key === p.focusKey) : -1;

  const groupName = (gid?: string) => {
    if (!gid) return '';
    const g = p.conf.groups?.[gid] as { name?: string } | undefined;
    return g?.name || gid;
  };

  return (
    <div className="fl" onDragEnd={() => (setDragFrom(null), setDragOver(null))}>
      <div className="fl-head">
        <span className="fl-head-tools">
          <button type="button" className="tb sm" title={allOpen ? 'Collapse all' : 'Expand all'} aria-label={allOpen ? 'Collapse all' : 'Expand all'} onClick={() => p.onExpandAll(!allOpen)}>
            {allOpen ? <CollapseAllOutlined /> : <ExpandAllOutlined />}
          </button>
        </span>
        <span>Function</span>
        <span>Filter</span>
      </div>
      {p.rows.length === 0 && <div className="fl-empty">This pipeline has no functions yet. Use Add Function above.</div>}
      {p.rows.map((r, i) => {
        const { fn } = r;
        const isComment = fn.id === 'comment';
        const active = isActive(fn, p.conf);
        const open = p.expanded.has(r.key);
        const focused = i === focusIndex;
        const before = focusIndex >= 0 && i < focusIndex;
        const newGroup = fn.groupId && fn.groupId !== p.rows[i - 1]?.fn.groupId;
        const cls = [
          'it',
          isComment && 'cmt',
          !active && !isComment && 'off',
          open && 'open',
          focused && 'focus',
          before && 'before',
          i === p.rows.length - 1 && 'last',
          dragOver === i && dragFrom !== i && 'drop-target',
        ]
          .filter(Boolean)
          .join(' ');
        const name = byId.get(fn.id)?.name ?? SPEC_BY_ID.get(fn.id)?.name ?? fn.id;
        return (
          <div key={r.key}>
            {newGroup && (
              <div className={`fl-grp${(p.conf.groups?.[fn.groupId!] as { disabled?: boolean } | undefined)?.disabled ? ' off' : ''}`}>
                <span>{groupName(fn.groupId)}</span>
              </div>
            )}
            <div
              className={cls}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) p.onMove(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
            >
              <div className="conn">
                <button type="button" className="num" aria-label={`${open ? 'Collapse' : 'Expand'} function ${i + 1}`} onClick={() => p.onToggleExpand(r.key)}>
                  {i + 1}
                </button>
              </div>
              <div className="card">
                <div className="hdr" onClick={() => p.onToggleExpand(r.key)}>
                  <span
                    className="grip"
                    draggable
                    title="Drag to reorder"
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(i));
                      setDragFrom(i);
                    }}
                  >
                    <GripDotsVertical />
                  </span>
                  <span className="en">
                    {isComment ? (
                      <span className="cmt-ico">
                        <Message />
                      </span>
                    ) : (
                      <>
                        <Toggle label={`Enable function ${i + 1}`} checked={!fn.disabled} onChange={(v) => p.onChange(r.key, { ...fn, disabled: !v })} />
                        {fn.final && (
                          <span className="final" title="Final: stops events from flowing down the pipeline" aria-label="Final">
                            <FinalIcon />
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  {isComment ? (
                    <span className="cmt-text" title={String(fn.conf.comment ?? '')}>
                      {String(fn.conf.comment ?? '') || <em className="na">N/A</em>}
                    </span>
                  ) : (
                    <>
                      <span className="name" title={fn.description ? `${name}: ${fn.description}` : name}>
                        {name}
                      </span>
                      <span className="flt mono" title={fn.filter ?? 'true'}>
                        <Js code={fn.filter ?? 'true'} />
                      </span>
                    </>
                  )}
                  <span className="acts" onClick={(e) => e.stopPropagation()}>
                    {!isComment && (
                      <button
                        type="button"
                        className={`lens${focused ? ' on' : ''}`}
                        title="Preview the data before and after this function"
                        aria-label={`Preview before and after function ${i + 1}`}
                        onClick={() => p.onInspect(r.key)}
                      >
                        <Bullseye />
                      </button>
                    )}
                    <RowMenu
                      index={i}
                      fn={fn}
                      catalog={p.catalog}
                      onInsert={(at, id) => p.onInsert(at, id)}
                      onInspect={() => p.onInspect(r.key)}
                      onToggle={() => p.onChange(r.key, { ...fn, disabled: !fn.disabled })}
                      onDuplicate={() => p.onDuplicate(r.key)}
                      onDelete={() => p.onDelete(r.key)}
                    />
                  </span>
                </div>
                {open && <FunctionForm fn={fn} meta={byId.get(fn.id)} spec={SPEC_BY_ID.get(fn.id)} onChange={(next) => p.onChange(r.key, next)} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface MenuProps {
  index: number;
  fn: PipelineFunction;
  catalog: FunctionMeta[];
  onInsert: (at: number, functionId: string) => void;
  onInspect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** The “⋯” menu at the end of each row, with Cribl's insert/copy/delete actions. */
function RowMenu({ index, fn, catalog, onInsert, onInspect, onToggle, onDuplicate, onDelete }: MenuProps) {
  const btn = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<null | 'menu' | 'above' | 'below'>(null);
  const close = () => setMode(null);
  const isComment = fn.id === 'comment';
  // `action` returning true keeps the popover open (used to switch to the function picker).
  const item = (icon: React.ReactNode, label: string, action: () => unknown, danger = false) => (
    <button
      type="button"
      className={`menu-it${danger ? ' danger' : ''}`}
      onClick={() => {
        if (action() !== true) close();
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <>
      <button ref={btn} type="button" className={`dots${mode ? ' on' : ''}`} aria-label={`Actions for function ${index + 1}`} onClick={() => setMode(mode ? null : 'menu')}>
        <Ellipsis />
      </button>
      {mode && (
        <Popover anchor={btn} onClose={close} align="right" width={mode === 'menu' ? 230 : 300}>
          {mode === 'menu' ? (
            <div className="menu">
              {item(<ArrowUp />, 'Insert Function Above', () => (setMode('above'), true))}
              {item(<ArrowDown />, 'Insert Function Below', () => (setMode('below'), true))}
              {item(<ArrowUp />, 'Insert Comment Above', () => onInsert(index, 'comment'))}
              {item(<ArrowDown />, 'Insert Comment Below', () => onInsert(index + 1, 'comment'))}
              <div className="menu-sep" />
              {!isComment && item(<Bullseye />, 'Preview before & after', onInspect)}
              {!isComment && item(fn.disabled ? <Eye /> : <EyeInvisible />, fn.disabled ? 'Enable' : 'Disable', onToggle)}
              {item(<Copy />, 'Copy', onDuplicate)}
              {item(<Trash />, 'Delete', onDelete, true)}
            </div>
          ) : (
            <AddFunctionMenu
              catalog={catalog}
              onPick={(id) => {
                onInsert(mode === 'above' ? index : index + 1, id);
                close();
              }}
            />
          )}
        </Popover>
      )}
    </>
  );
}

/** Cribl's blue “Add Function ▾” button; opens the categorised function picker. */
export function AddFunctionButton({ catalog, onPick }: { catalog: FunctionMeta[]; onPick: (functionId: string) => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={btn} type="button" className={`add-fn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)}>
        Add Function <CaretDownSolid />
      </button>
      {open && (
        <Popover anchor={btn} onClose={() => setOpen(false)} width={300}>
          <AddFunctionMenu
            catalog={catalog}
            onPick={(id) => {
              onPick(id);
              setOpen(false);
            }}
          />
        </Popover>
      )}
    </>
  );
}

/** Cribl's “final” marker: an arrow turning down into a stop bar. */
function FinalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 2v4.5a2 2 0 0 0 2 2h7" />
      <path d="M9.5 6l2.5 2.5L9.5 11" />
      <path d="M2 14h12" />
    </svg>
  );
}
