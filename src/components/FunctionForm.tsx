import { useState, type ReactNode } from 'react';
import { SelectField } from '@capra/core';
import { ArrowUpRightFromSquare, ChevronDown, ChevronRight, CircleQuestion, DragGrip, TriangleExclamation } from '@capra/icons';
import { JsInput, RowRemove, SchemaForm, TagsInput } from './SchemaForm';
import { Toggle } from './ui';
import type { ColSpec, Conf, FieldSpec, FunctionSpec } from '../lib/functionSpecs';
import type { JSONSchema, UiSchema } from '../lib/schemaForm';
import type { FunctionMeta, PipelineFunction } from '../lib/types';

interface Props {
  fn: PipelineFunction;
  /** Cribl's schema for the function; drives the form when present. */
  meta?: FunctionMeta;
  /** Hand-built form, used only until the function catalogue has loaded. */
  spec?: FunctionSpec;
  onChange: (fn: PipelineFunction) => void;
}

/** Settings panel shown under an expanded function row, laid out like Cribl's. */
export function FunctionForm({ fn, meta, spec, onChange }: Props) {
  const schema = meta?.schema as JSONSchema | undefined;
  const hasForm = !!schema || !!spec;
  const [asJson, setAsJson] = useState(!hasForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isComment = fn.id === 'comment';

  const setConf = (k: string, v: unknown) => {
    const conf = { ...fn.conf };
    const keepEmpty = spec && k in spec.defaults;
    if (v === undefined || (v === '' && !keepEmpty)) delete conf[k];
    else conf[k] = v;
    onChange({ ...fn, conf });
  };

  const visible = (spec?.fields ?? []).filter((f) => !f.show || f.show(fn.conf));
  const basic = visible.filter((f) => !f.advanced);
  const advanced = visible.filter((f) => f.advanced);

  return (
    <div className="edit" onClick={(e) => e.stopPropagation()}>
      {NOTES[fn.id]}
      <div className="edit-main">
        <div className="edit-tools">
          {hasForm && !isComment && (
            <button type="button" className="linkbtn" onClick={() => setAsJson((v) => !v)} title={asJson ? 'Back to the settings form' : 'Edit the settings as JSON'}>
              {asJson ? 'Form' : 'JSON'}
            </button>
          )}
          <a className="help-link" href={docsUrl(fn.id)} target="_blank" rel="noopener noreferrer">
            Help <HelpIcon />
          </a>
        </div>
        {!isComment && (
          <div className="edit-common">
            <Field label="Filter" help="Filter that selects data to be fed through this Function">
              <JsInput value={fn.filter ?? 'true'} onChange={(v) => onChange({ ...fn, filter: v })} label="Filter" />
            </Field>
            <Field label="Description" help="Simple description about this Function">
              <input
                className="in"
                value={fn.description ?? ''}
                placeholder="Enter a description"
                onChange={(e) => onChange({ ...fn, description: e.target.value || undefined })}
                aria-label="Description"
              />
            </Field>
            <div className="inline-switch">
              <label title="If enabled, stops results from flowing down the pipeline">
                Final <CircleQuestion />
              </label>
              <Toggle label="Final" checked={!!fn.final} onChange={(v) => onChange({ ...fn, final: v || undefined })} />
            </div>
          </div>
        )}

        {asJson ? (
          <JsonConf conf={fn.conf} onApply={(conf) => onChange({ ...fn, conf })} />
        ) : schema ? (
          <SchemaForm schema={schema} ui={meta?.uischema as UiSchema | undefined} value={fn.conf} onChange={(conf) => onChange({ ...fn, conf })} />
        ) : (
          <>
            {spec && spec.fields.length === 0 && <p className="hint">This function has no settings.</p>}
            {basic.map((f) => (
              <SpecField key={f.k} field={f} conf={fn.conf} set={setConf} />
            ))}
            {advanced.length > 0 && (
              <>
                <button type="button" className={`adv-toggle${showAdvanced ? ' open' : ''}`} onClick={() => setShowAdvanced((v) => !v)}>
                  {showAdvanced ? <ChevronDown /> : <ChevronRight />} Advanced Settings
                </button>
                {showAdvanced && advanced.map((f) => <SpecField key={f.k} field={f} conf={fn.conf} set={setConf} />)}
              </>
            )}
          </>
        )}

        {!hasForm && <p className="hint">Cribl has no settings form for “{fn.id}”. Edit its settings as JSON.</p>}
      </div>
    </div>
  );
}

// Cribl's docs use a few names that differ from the function id.
/** Notices Cribl shows above a function's settings. */
const NOTES: Record<string, ReactNode> = {
  code: (
    <p className="fn-note">
      <TriangleExclamation />
      Use the Code Function to encapsulate your own JavaScript code, but only if Cribl standard Functions are not sufficient for your needs. This Function applies JavaScript{' '}
      <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode" target="_blank" rel="noopener noreferrer">
        strict mode <ArrowUpRightFromSquare />
      </a>{' '}
      <a href="https://docs.cribl.io/stream/code-function/" target="_blank" rel="noopener noreferrer">
        Learn more. <ArrowUpRightFromSquare />
      </a>
    </p>
  ),
};

const DOC_SLUG: Record<string, string> = {
  serde: 'parser',
  aggregation: 'aggregations',
  cef: 'cef-serializer',
  regex_filter: 'regex-filter',
  sensitive_data_scanner: 'sensitive-data-scanner',
};

/** The function's page in Cribl's docs, which is what Cribl's own Help link opens. */
function docsUrl(id: string) {
  return `https://docs.cribl.io/stream/${DOC_SLUG[id] ?? id.replace(/_/g, '-')}-function/`;
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label title={help}>
        {label}
        {help && <CircleQuestion />}
      </label>
      {children}
    </div>
  );
}

function SpecField({ field: f, conf, set }: { field: FieldSpec; conf: Conf; set: (k: string, v: unknown) => void }) {
  const v = conf[f.k];
  switch (f.t) {
    case 'expr':
      return (
        <Field label={f.label} help={f.help}>
          <JsInput value={v === undefined || v === null ? '' : String(v)} placeholder={f.placeholder} onChange={(x) => set(f.k, x)} label={f.label} />
        </Field>
      );
    case 'text':
    case 'regex':
      return (
        <Field label={f.label} help={f.help}>
          <input
            className={`in${f.t === 'text' ? '' : ' mono'}`}
            value={v === undefined || v === null ? '' : String(v)}
            placeholder={f.placeholder}
            onChange={(e) => set(f.k, e.target.value)}
            aria-label={f.label}
          />
        </Field>
      );
    case 'code':
      return (
        <Field label={f.label} help={f.help}>
          <textarea className="in mono" rows={f.rows ?? 4} value={typeof v === 'string' ? v : ''} placeholder={f.placeholder} onChange={(e) => set(f.k, e.target.value)} aria-label={f.label} />
        </Field>
      );
    case 'number':
      return (
        <Field label={f.label} help={f.help}>
          <input
            className="in num-in"
            type="number"
            min={f.min}
            max={f.max}
            value={typeof v === 'number' ? v : ''}
            onChange={(e) => set(f.k, e.target.value === '' ? undefined : Number(e.target.value))}
            aria-label={f.label}
          />
        </Field>
      );
    case 'bool':
      return (
        <div className="inline-switch">
          <label title={f.help}>
            {f.label}
            {f.help && <CircleQuestion />}
          </label>
          <Toggle label={f.label} checked={!!v} onChange={(x) => set(f.k, x)} />
        </div>
      );
    case 'select':
      return (
        <Field label={f.label} help={f.help}>
          <div className="sel-wrap">
            <SelectField
              aria-label={f.label}
              size="sm"
              value={typeof v === 'string' ? v : f.options[0][0]}
              onChange={(key) => key !== null && set(f.k, String(key))}
              items={f.options.map(([id, label]) => ({ id, label }))}
            />
          </div>
        </Field>
      );
    case 'tags':
      return (
        <Field label={f.label} help={f.help}>
          <TagsInput value={Array.isArray(v) ? (v as string[]) : []} placeholder={f.placeholder} label={f.label} onChange={(t) => set(f.k, t)} />
        </Field>
      );
    case 'list': {
      const list = Array.isArray(v) ? (v as string[]) : [];
      return (
        <Field label={f.label} help={f.help}>
          <div className="tbl">
            {list.map((item, i) => (
              <div className="tbl-row" key={i}>
                <input
                  className={`in${f.mono ? ' mono' : ''}`}
                  value={item}
                  placeholder={f.placeholder}
                  aria-label={`${f.label} ${i + 1}`}
                  onChange={(e) =>
                    set(
                      f.k,
                      list.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
                <RowRemove
                  onClick={() =>
                    set(
                      f.k,
                      list.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
            <button type="button" className="add-row-btn" onClick={() => set(f.k, [...list, ''])}>
              {f.addLabel}
            </button>
          </div>
        </Field>
      );
    }
    case 'table':
      return (
        <Field label={f.label} help={f.help}>
          <Table rows={Array.isArray(v) ? (v as Conf[]) : []} cols={f.cols} addLabel={f.addLabel} label={f.label} onChange={(r) => set(f.k, r)} />
        </Field>
      );
  }
}

function Table({ rows, cols, addLabel, label, onChange }: { rows: Conf[]; cols: ColSpec[]; addLabel: string; label: string; onChange: (rows: Conf[]) => void }) {
  const template = ['16px', ...cols.map((c) => c.width ?? '1fr'), '20px'].join(' ');
  const setCell = (i: number, k: string, val: unknown) => {
    onChange(
      rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r };
        if (val === undefined) delete next[k];
        else next[k] = val;
        return next;
      }),
    );
  };
  const blank = () => Object.fromEntries(cols.filter((c) => c.def !== undefined || c.t !== 'enabled').map((c) => [c.k, c.def ?? '']));

  return (
    <div className="tbl">
      {rows.length > 0 && (
        <div className="tbl-row tbl-head" style={{ gridTemplateColumns: template }}>
          <span />
          {cols.map((c) => (
            <span key={c.k}>{c.label}</span>
          ))}
          <span />
        </div>
      )}
      {rows.map((r, i) => (
        <div className="tbl-row" key={i} style={{ gridTemplateColumns: template }}>
          <span className="tbl-grip">
            <DragGrip />
          </span>
          {cols.map((c) => {
            const cell = r[c.k];
            const aria = `${label} row ${i + 1} ${c.label}`;
            if (c.t === 'enabled') {
              return (
                <span key={c.k} className="tbl-tgl">
                  <Toggle label={aria} checked={!cell} onChange={(x) => setCell(i, c.k, !x)} />
                </span>
              );
            }
            if (c.t === 'number') {
              return (
                <input
                  key={c.k}
                  className="in"
                  type="number"
                  aria-label={aria}
                  value={typeof cell === 'number' ? cell : ''}
                  onChange={(e) => setCell(i, c.k, e.target.value === '' ? undefined : Number(e.target.value))}
                />
              );
            }
            if (c.t === 'expr') {
              return <JsInput key={c.k} label={aria} placeholder={c.placeholder} value={cell === undefined || cell === null ? '' : String(cell)} onChange={(x) => setCell(i, c.k, x)} />;
            }
            return (
              <input
                key={c.k}
                className="in"
                aria-label={aria}
                placeholder={c.placeholder}
                value={cell === undefined || cell === null ? '' : String(cell)}
                onChange={(e) => setCell(i, c.k, e.target.value)}
              />
            );
          })}
          <RowRemove onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={() => onChange([...rows, blank()])}>
        {addLabel}
      </button>
    </div>
  );
}

/** Raw JSON editor for a function's `conf`; applies on blur when the JSON parses. */
function JsonConf({ conf, onApply }: { conf: Conf; onApply: (c: Conf) => void }) {
  const text = JSON.stringify(conf, null, 2);
  const [draft, setDraft] = useState(text);
  const [base, setBase] = useState(text);
  const [error, setError] = useState('');
  // Pick up outside changes (e.g. Revert) when the user has not started editing.
  if (text !== base) {
    setBase(text);
    setDraft(text);
    setError('');
  }
  return (
    <Field label="Settings (JSON)">
      <textarea
        className={`in mono${error ? ' bad' : ''}`}
        rows={Math.min(18, Math.max(4, draft.split('\n').length))}
        value={draft}
        aria-label="Function settings JSON"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(draft) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Settings must be a JSON object');
            setError('');
            onApply(parsed as Conf);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error && <div className="err-text">{error}</div>}
    </Field>
  );
}

/** Cribl's docs-panel icon: a framed play arrow beside a filled “?” tab. */
function HelpIcon() {
  return (
    <svg className="help-ic" viewBox="0 0 22 16" width="22" height="16" aria-hidden>
      <rect x="0.5" y="0.5" width="21" height="15" fill="currentColor" />
      <rect x="1.5" y="1.5" width="12" height="13" fill="#fff" />
      <path d="M6 4.5v7l5-3.5z" fill="currentColor" />
      <text x="17.7" y="12.2" fontSize="11" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif">
        ?
      </text>
    </svg>
  );
}
