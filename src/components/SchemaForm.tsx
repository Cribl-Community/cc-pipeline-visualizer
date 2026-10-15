import { useContext, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Modal, SelectField } from '@capra/core';
import { ArrowUpRightFromSquare, ChevronDown, ChevronRight, CircleQuestion, Copy, DragGrip, FlagOutlined, CloseOutlined, EditOutlined } from '@capra/icons';
import { FormContext } from './formContext';
import { Js, Toggle } from './ui';
import { listParserLibrary, lookupOptions, type ParserLibEntry } from '../lib/api';
import {
  addLabelFor,
  applyChange,
  blankItem,
  deref,
  groupsOf,
  helpText,
  isMissing,
  kindOf,
  labelOf,
  resolve,
  uiOptions,
  withConf,
  type JSONSchema,
  type Kind,
  type UiSchema,
  type Value,
} from '../lib/schemaForm';

interface Props {
  schema: JSONSchema;
  ui?: UiSchema;
  value: Value;
  onChange: (v: Value) => void;
}

/** A Cribl function's settings form, drawn from the schema and uischema Cribl itself uses. */
export function SchemaForm({ schema, ui = {}, value, onChange }: Props) {
  const { properties } = resolve(schema, value, schema);
  if (!properties.some(([k, p]) => kindOf(p, ui[k], schema) !== 'hidden')) return null;
  return <ObjectFields schema={schema} root={schema} ui={ui} value={value} onChange={onChange} />;
}

function ObjectFields({ schema, root, ui: rawUi, value, onChange }: { schema: JSONSchema; root: JSONSchema; ui: UiSchema; value: Value; onChange: (v: Value) => void }) {
  const ui = withConf(rawUi, value);
  const { properties, required } = resolve(schema, value, root);
  const groups = groupsOf(ui);
  const grouped = new Set(groups.flatMap((g) => g.properties));
  const byKey = new Map(properties);
  const field = (k: string, p: JSONSchema) => (
    <Prop
      key={k}
      name={k}
      schema={p}
      root={root}
      ui={(ui[k] as UiSchema) ?? {}}
      value={value[k]}
      required={required.has(k)}
      onChange={(v) => onChange(applyChange(schema, value, k, v, root))}
      onMerge={(patch) => {
        // Apply the trigger first so its branch's keys survive the prune, then the rest.
        let next = 'type' in patch ? applyChange(schema, value, 'type', patch.type, root) : value;
        for (const [pk, pv] of Object.entries(patch)) if (pk !== 'type') next = { ...next, [pk]: pv };
        onChange(next);
      }}
    />
  );
  return (
    <div className="sf">
      {properties.filter(([k]) => !grouped.has(k)).map(([k, p]) => field(k, p))}
      {groups.map((g) => {
        const inGroup = g.properties.filter((k) => byKey.has(k) && kindOf(byKey.get(k)!, ui[k], root) !== 'hidden');
        if (!inGroup.length) return null;
        return (
          <Section key={g.key} title={g.title} help={g.description} collapsed={g.collapsed}>
            {inGroup.map((k) => field(k, byKey.get(k)!))}
          </Section>
        );
      })}
    </div>
  );
}

/** Cribl's collapsible “› Advanced Settings” style section. */
function Section({ title, help, collapsed, children }: { title: string; help?: string; collapsed: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div className="sf-sec">
      <button type="button" className={`adv-toggle${open ? ' open' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown /> : <ChevronRight />} {title}
        {help && (
          <span className="sec-help" title={help}>
            <CircleQuestion />
          </span>
        )}
      </button>
      {open && <div className="sf">{children}</div>}
    </div>
  );
}

interface PropProps {
  name: string;
  schema: JSONSchema;
  root: JSONSchema;
  ui: UiSchema;
  value: unknown;
  required: boolean;
  onChange: (v: unknown) => void;
  /** Sets several sibling values at once (a parser library pick sets type, fields, delimiters…). */
  onMerge: (patch: Value) => void;
}

function Prop({ name, schema, root, ui, value, required, onChange: emit, onMerge }: PropProps) {
  // Like Cribl, a required field is only flagged once the user has edited it.
  const [touched, setTouched] = useState(false);
  const onChange = (v: unknown) => {
    setTouched(true);
    emit(v);
  };
  const kind = kindOf(schema, ui, root);
  if (kind === 'hidden') return null;
  const o = uiOptions(ui);
  const label = labelOf(name, schema, ui);
  const help = helpText(schema.description);
  const width = typeof o.width === 'string' ? o.width : undefined;
  const style: CSSProperties = o.inline ? { flex: `0 0 ${width ?? '50%'}`, maxWidth: width ?? '50%' } : { flex: '0 0 100%' };
  const missing = touched && required && isMissing(schema, value ?? schema.default);
  const cls = `sf-f${o.inline ? ' inl' : ''}${missing ? ' miss' : ''}`;

  if (kind === 'object') {
    // Untitled nested objects (e.g. Redis TLS options) render flat, as Cribl does.
    if (!schema.title) {
      return (
        <div className="sf-flat" style={style}>
          <ObjectFields schema={schema} root={root} ui={ui} value={(value as Value) ?? {}} onChange={onChange} />
        </div>
      );
    }
    return (
      <fieldset className="sf-obj" style={style}>
        {label && <legend title={help}>{label}</legend>}
        <ObjectFields schema={schema} root={root} ui={ui} value={(value as Value) ?? {}} onChange={onChange} />
      </fieldset>
    );
  }

  // Without an Auto-Parse option (Serialize), Cribl shows Type beside a parser-library picker.
  if (ui['ui:widget'] === 'ParserSelect' && !(schema.enum ?? []).includes('auto')) {
    return (
      <div className="sf-f parser-lib" style={style}>
        <div className="parser-lib-type">
          {label && <FieldLabel label={label} help={help} required={required} />}
          <EnumInput schema={schema} ui={ui} value={value ?? schema.default} label={label ?? name} radio={false} onChange={onChange} />
        </div>
        <div className="parser-lib-pick">
          <FieldLabel label="Library" help="Fill in the type and fields from a parser in the library" />
          <ParserLibrary onPick={onMerge} />
        </div>
      </div>
    );
  }
  if (ui['ui:widget'] === 'BackgroundDetectionToggle') {
    return (
      <div className={cls} style={style}>
        <div className="inline-switch bg-detect">
          <FieldLabel label={schema.title ?? 'Background detection'} help={help} />
          <Toggle label={schema.title ?? 'Background detection'} checked={!!(value ?? schema.default)} onChange={onChange} />
        </div>
        <p className="sf-desc">
          Background detection will review a sample of events and alert you to remaining sensitive data in any event field. See documentation for{' '}
          <a href="https://docs.cribl.io/stream/cribl-guard/" target="_blank" rel="noopener noreferrer">
            more information
          </a>
          .
        </p>
      </div>
    );
  }
  const control = <Widget kind={kind} name={name} schema={schema} root={root} ui={ui} value={value} label={label ?? name} onChange={onChange} />;
  if (kind === 'bool' && o.labelInline !== false) {
    return (
      <div className={`${cls} inline-switch${o.labelInline === true ? ' li' : ''}`} style={style}>
        {label && <FieldLabel label={label} help={help} required={required} />}
        {control}
      </div>
    );
  }
  if (o.labelInline === true && label) {
    return (
      <div className={`${cls} label-inl`} style={style}>
        <div className="label-inl-row" style={width ? { maxWidth: width } : undefined}>
          <FieldLabel label={label} help={help} required={required} />
          {control}
        </div>
        {missing && <div className="err-text">{label} is required</div>}
      </div>
    );
  }
  return (
    <div className={cls} style={style}>
      {label && <FieldLabel label={label} help={help} required={required} />}
      <div style={!o.inline && width ? { maxWidth: width } : undefined}>{control}</div>
      {missing && <div className="err-text">{label ?? name} is required</div>}
    </div>
  );
}

export function FieldLabel({ label, help, required }: { label: string; help?: string; required?: boolean }) {
  return (
    <label title={help}>
      {label}
      {required && '*'}
      {help && <CircleQuestion />}
    </label>
  );
}

const str = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v));

interface WidgetProps {
  kind: Kind;
  name: string;
  schema: JSONSchema;
  root: JSONSchema;
  ui: UiSchema;
  value: unknown;
  label: string;
  onChange: (v: unknown) => void;
}

/** The bare control for one property; shared by top-level fields and table cells. */
function Widget({ kind, schema, root, ui, value, label, onChange }: WidgetProps) {
  const o = uiOptions(ui);
  const placeholder: string | undefined = ui['ui:placeholder'];
  const shown = value ?? schema.default;
  const noPopup = /WithoutPopup$/.test(String(ui['ui:widget'] ?? ''));
  switch (kind) {
    case 'bool': {
      const on = !!shown;
      return <Toggle label={label} checked={o.inverted ? !on : on} onChange={(x) => onChange(o.inverted ? !x : x)} />;
    }
    case 'number':
      return (
        <input
          className="in num-in"
          type="number"
          min={schema.minimum}
          max={schema.maximum}
          aria-label={label}
          placeholder={placeholder}
          value={typeof shown === 'number' ? shown : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'select':
      if (ui['ui:widget'] === 'ParserSelect') return <ParserSelect schema={schema} ui={ui} value={shown} onChange={onChange} />;
      return <EnumInput schema={schema} ui={ui} value={shown} label={label} radio={false} onChange={onChange} />;
    case 'radio':
      return <EnumInput schema={schema} ui={ui} value={shown} label={label} radio={kind === 'radio'} onChange={onChange} />;
    case 'js':
      return <JsInput value={str(shown)} placeholder={placeholder} label={label} onChange={onChange} popup={!noPopup} />;
    case 'grok':
      return <JsInput value={str(shown)} placeholder={placeholder} label={label} onChange={onChange} prefix="G" />;
    case 'jscode':
    case 'code':
      return <CodeEditor value={str(shown)} js={kind === 'jscode'} lines={Math.max(3, Number(o.numLines) || 5)} grow={!!o.autoheight} label={label} placeholder={placeholder} onChange={onChange} />;
    case 'textarea':
      return (
        <textarea
          // Cribl's autoSize textareas (Comment) start as a single monospace row and grow with the text.
          className={`in${o.autoSize ? ' mono auto-ta' : ''}`}
          rows={o.autoSize ? Math.min(14, str(shown).split('\n').length) : Math.max(2, Math.min(14, Number(o.numLines) || str(shown).split('\n').length + 1))}
          aria-label={label}
          placeholder={placeholder}
          value={str(shown)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'label':
      return <div className="in ro">{str(shown)}</div>;
    case 'lookup':
      return <Lookup ui={ui} value={str(shown)} label={label} placeholder={placeholder} onChange={onChange} />;
    case 'tags':
      return <TagsInput value={Array.isArray(shown) ? shown.map(String) : []} placeholder={placeholder ?? 'Enter values'} label={label} onChange={onChange} />;
    case 'list':
      return <ListInput schema={schema} root={root} ui={ui} value={Array.isArray(shown) ? shown : []} label={label} onChange={onChange} />;
    case 'table':
      return <TableInput schema={schema} root={root} ui={ui} value={Array.isArray(shown) ? (shown as Value[]) : []} label={label} onChange={onChange} />;
    case 'cards':
      return <CardsInput schema={schema} root={root} ui={ui} value={Array.isArray(shown) ? (shown as Value[]) : []} label={label} onChange={onChange} />;
    case 'kvlist':
      return <KvListInput schema={schema} ui={ui} value={Array.isArray(shown) ? (shown as Value[]) : []} label={label} onChange={onChange} />;
    case 'kv':
      return <KeyValueInput value={(shown as Record<string, unknown>) ?? {}} ui={ui} jsValues={!!(schema.additionalProperties as JSONSchema)?.jsExpression} label={label} onChange={onChange} />;
    case 'json':
    case 'object':
      return <JsonInput value={shown} label={label} onChange={onChange} />;
    case 'regex':
      return <RegexInput value={str(shown)} label={label} placeholder={placeholder} onChange={onChange} popup={!noPopup} />;
    case 'text':
    default:
      return <input className="in" aria-label={label} placeholder={placeholder} value={str(shown)} onChange={(e) => onChange(e.target.value)} />;
  }
}

function EnumInput({
  schema,
  ui,
  value,
  label,
  radio,
  disabled,
  onChange,
}: {
  schema: JSONSchema;
  ui: UiSchema;
  value: unknown;
  label: string;
  radio: boolean;
  disabled?: boolean;
  onChange: (v: unknown) => void;
}) {
  const values = schema.enum ?? [];
  const rich = (uiOptions(ui).uiEnumOptions ?? []) as {
    value: unknown;
    label?: string;
  }[];
  const labelFor = (v: unknown, i: number) => rich.find((r) => r.value === v)?.label ?? schema.enumNames?.[i] ?? String(v);
  const idx = values.findIndex((v) => v === value);
  if (radio) {
    return (
      <div className="seg" role="radiogroup" aria-label={label}>
        {values.map((v, i) => (
          <button key={String(v)} type="button" role="radio" aria-checked={i === idx} className={`seg-b${i === idx ? ' on' : ''}`} onClick={() => onChange(v)}>
            {labelFor(v, i)}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="sel-wrap">
      <SelectField
        aria-label={label}
        size="sm"
        value={idx >= 0 ? String(idx) : null}
        disabled={disabled}
        placeholder="Select"
        onChange={(key) => key !== null && onChange(values[Number(key)])}
        items={values.map((v, i) => ({ id: String(i), label: labelFor(v, i) }))}
      />
    </div>
  );
}

/** Parser's type picker: an Auto-Parse switch, and the Type list once it is off. */
function ParserSelect({ schema, ui, value, onChange }: { schema: JSONSchema; ui: UiSchema; value: unknown; onChange: (v: unknown) => void }) {
  const auto = value === 'auto';
  const values = schema.enum ?? [];
  const firstManual = values.find((v) => v !== 'auto');
  const manual: JSONSchema = {
    ...schema,
    enum: values.filter((v) => v !== 'auto'),
    enumNames: schema.enumNames?.filter((_, i) => values[i] !== 'auto'),
  };
  return (
    <div className="parser-sel">
      <span className="parser-auto">
        <FieldLabel label="Auto-Parse" help="Detect the format of each event and parse it automatically" />
        <Toggle label="Auto-Parse" checked={auto} onChange={(on) => onChange(on ? 'auto' : firstManual)} />
        <span className="badge-new">New Feature</span>
      </span>
      <span className="parser-type">
        <FieldLabel label="Type" help={helpText(schema.description)} required />
        {auto ? (
          <EnumInput schema={schema} ui={ui} value="auto" label="Type" radio={false} disabled onChange={() => {}} />
        ) : (
          <EnumInput schema={manual} ui={ui} value={value} label="Type" radio={false} onChange={onChange} />
        )}
      </span>
    </div>
  );
}

/** Picks a parser-library entry and hands back the settings it carries. */
function ParserLibrary({ onPick }: { onPick: (patch: Value) => void }) {
  const ctx = useContext(FormContext);
  const [items, setItems] = useState<ParserLibEntry[]>([]);
  useEffect(() => {
    let live = true;
    if (ctx.group) void listParserLibrary(ctx.group, ctx.pack).then((x) => live && setItems(x));
    return () => {
      live = false;
    };
  }, [ctx.group, ctx.pack]);
  return (
    <div className="sel-wrap">
      <SelectField
        aria-label="Library"
        size="sm"
        value={null}
        placeholder="Select from Library"
        disabled={!items.length}
        onChange={(key) => {
          const hit = key === null ? undefined : items[Number(key)];
          if (!hit) return;
          const { id: _id, lib: _lib, description: _d, tags: _t, ...conf } = hit;
          void [_id, _lib, _d, _t];
          onPick(structuredClone(conf));
        }}
        items={items.map((x, i) => ({ id: String(i), label: x.id }))}
      />
    </div>
  );
}

/** Cribl's ApiLookup/AutoComplete: a text box with suggestions, or a plain picker when not editable. */
function Lookup({ ui, value, label, placeholder, onChange }: { ui: UiSchema; value: string; label: string; placeholder?: string; onChange: (v: unknown) => void }) {
  const o = uiOptions(ui);
  const ctx = useContext(FormContext);
  const fixed = ((o.uiEnumOptions ?? []) as { value: unknown; label?: string }[]).map((x) => ({ value: String(x.value), label: x.label ?? String(x.value) }));
  const [fetched, setFetched] = useState<{ value: string; label: string }[]>([]);
  const url: string | undefined = typeof o.url === 'string' && !o.url.includes('secrets') ? o.url : undefined;
  useEffect(() => {
    let live = true;
    if (url && ctx.group) {
      void lookupOptions(ctx.group, ctx.pack, url, o).then((x) => live && setFetched(x));
    }
    return () => {
      live = false;
    };
    // `o` is rebuilt every render; the URL and context are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ctx.group, ctx.pack]);
  const options = fixed.length ? fixed : o.lookupProvider === 'ProjectAwarePipelines' ? ctx.pipelines.map((p) => ({ value: p, label: p })) : fetched;
  const listId = `lk-${useId()}`;

  if (o.editable === false && options.length) {
    const idx = options.findIndex((x) => x.value === value);
    return (
      <div className="sel-wrap">
        <SelectField
          aria-label={label}
          size="sm"
          value={idx >= 0 ? String(idx) : null}
          placeholder={placeholder ?? 'Select'}
          onChange={(key) => key !== null && onChange(options[Number(key)].value)}
          items={options.map((x, i) => ({ id: String(i), label: x.label }))}
        />
      </div>
    );
  }
  return (
    <>
      <input className="in" list={options.length ? listId : undefined} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label !== x.value ? x.label : undefined}
            </option>
          ))}
        </datalist>
      )}
    </>
  );
}

/** Drag-to-reorder for table rows and cards, via the grip. */
function useReorder<T>(rows: T[], onChange: (rows: T[]) => void) {
  const [from, setFrom] = useState<number | null>(null);
  return {
    grip: (i: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
        setFrom(i);
      },
      onDragEnd: () => setFrom(null),
    }),
    target: (i: number) => ({
      onDragOver: (e: React.DragEvent) => {
        if (from !== null) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      onDrop: (e: React.DragEvent) => {
        if (from === null) return;
        e.preventDefault();
        e.stopPropagation();
        if (from !== i) {
          const next = [...rows];
          const [moved] = next.splice(from, 1);
          next.splice(i, 0, moved);
          onChange(next);
        }
        setFrom(null);
      },
    }),
  };
}

interface ArrayProps<T> {
  schema: JSONSchema;
  root: JSONSchema;
  ui: UiSchema;
  value: T[];
  label: string;
  onChange: (v: T[]) => void;
}

/** Cribl's grid table (“Evaluate fields”, “Lookup fields”…): a column per item property. */
function TableInput({ schema, root, ui, value, label, onChange }: ArrayProps<Value>) {
  const items = deref(schema.items ?? {}, root);
  const itemUi = (ui.items ?? {}) as UiSchema;
  const cols = resolve(items, {}, root).properties.filter(([k, p]) => kindOf(p, itemUi[k], root) !== 'hidden');
  const reorder = useReorder(value, onChange);
  // Fixed tables (CEF's header fields) can't be added to, emptied or reordered.
  const { addable = true, removable = true, orderable = true, popupEditor, popupEditorTitle, editLink, showActionsHeader } = uiOptions(ui);
  // Mask's and Guard's rows also get Cribl's pencil, opening the row in a dialog.
  const editable = !!(popupEditor || editLink);
  const [editing, setEditing] = useState<{ i: number; row: Value } | null>(null);
  const widthOf = (k: string, p: JSONSchema) => {
    const w = uiOptions(itemUi[k]).columnWidth;
    // Percentages (also inside calc(), e.g. `calc(30% + 10px)`) become shares of the free space.
    const pct = typeof w === 'string' ? /([\d.]+)%/.exec(w) : null;
    if (pct) return `minmax(0, ${parseFloat(pct[1])}fr)`;
    if (typeof w === 'string') return w;
    return kindOf(p, itemUi[k], root) === 'bool' ? '90px' : 'minmax(0, 1fr)';
  };
  const template = [...(orderable ? ['24px'] : []), ...cols.map(([k, p]) => widthOf(k, p)), ...(removable || editable ? [editable ? (showActionsHeader ? '64px' : '48px') : '24px'] : [])].join(' ');
  const setRow = (i: number, row: Value) => onChange(value.map((r, j) => (j === i ? row : r)));

  return (
    <div className="tbl-wrap">
      {value.length > 0 && (
        <div className="tbl">
          <div className="tbl-row tbl-head" style={{ gridTemplateColumns: template }}>
            {orderable && <span />}
            {cols.map(([k, p]) => {
              const help = helpText(p.description);
              return (
                <span key={k} className={kindOf(p, itemUi[k], root) === 'bool' ? 'c' : undefined} title={help}>
                  {labelOf(k, p, itemUi[k]) ?? ''}
                  {help && <CircleQuestion />}
                </span>
              );
            })}
            {(removable || editable) && <span className="c">{showActionsHeader ? 'Actions' : ''}</span>}
          </div>
          {value.map((row, i) => (
            <div className="tbl-row" key={i} style={{ gridTemplateColumns: template }} {...(orderable ? reorder.target(i) : {})}>
              {orderable && (
                <span className="tbl-grip" title="Drag to reorder" {...reorder.grip(i)}>
                  <DragGrip />
                </span>
              )}
              {resolve(items, row ?? {}, root)
                .properties.filter(([k]) => cols.some(([c]) => c === k))
                .map(([k, p]) => {
                  const kind = kindOf(p, itemUi[k], root);
                  const aria = `${label} row ${i + 1} ${labelOf(k, p, itemUi[k]) ?? k}`;
                  const cell = (
                    <Widget
                      kind={kind === 'cards' || kind === 'table' || kind === 'object' ? 'json' : kind}
                      name={k}
                      schema={p}
                      root={root}
                      ui={itemUi[k] ?? {}}
                      value={row?.[k]}
                      label={aria}
                      onChange={(v) => setRow(i, applyChange(items, row ?? {}, k, v, root))}
                    />
                  );
                  return kind === 'bool' ? (
                    <span key={k} className="tbl-tgl">
                      {cell}
                    </span>
                  ) : (
                    <div key={k} className="tbl-cell">
                      {cell}
                    </div>
                  );
                })}
              {editable ? (
                <span className="tbl-acts">
                  <button type="button" className="row-edit" aria-label={`Edit ${label} row ${i + 1}`} title="Edit" onClick={() => setEditing({ i, row: row ?? {} })}>
                    <EditOutlined />
                  </button>
                  {removable && <RowRemove onClick={() => onChange(value.filter((_, j) => j !== i))} />}
                </span>
              ) : (
                removable && <RowRemove onClick={() => onChange(value.filter((_, j) => j !== i))} />
              )}
            </div>
          ))}
        </div>
      )}
      {addable && (
        <button type="button" className="add-row-btn" onClick={() => onChange([...value, blankItem(schema.items, root) as Value])}>
          {addLabelFor(schema.title ?? label, ui)}
        </button>
      )}
      {editing && (
        <Modal
          isOpen
          title={typeof popupEditorTitle === 'string' ? popupEditorTitle : `Edit ${labelOf('', items, {}) || 'row'}`}
          confirmButtonText="Save"
          cancelButtonText="Cancel"
          onIsOpenChange={(open) => !open && setEditing(null)}
          onClose={() => setEditing(null)}
          onConfirm={() => {
            setRow(editing.i, editing.row);
            setEditing(null);
          }}
        >
          <div className="row-ed">
            <ObjectFields schema={items} root={root} ui={itemUi} value={editing.row} onChange={(row) => setEditing({ i: editing.i, row })} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/** A list of single values, each with its own widget (e.g. Aggregations' expressions). */
function ListInput({ schema, root, ui, value, label, onChange }: ArrayProps<unknown>) {
  const items = deref(schema.items ?? {}, root);
  const itemUi = (ui.items ?? {}) as UiSchema;
  const kind = kindOf(items, itemUi, root);
  // A required list starts with one empty row, like Cribl's Aggregates.
  const rows = value.length || !(schema.minItems ?? 0) ? value : [blankItem(schema.items, root)];
  const reorder = useReorder(rows, onChange);
  return (
    <div className="tbl-wrap">
      {rows.length > 0 && (
        <div className="tbl">
          {rows.map((v, i) => (
            <div className="tbl-row" key={i} style={{ gridTemplateColumns: '24px minmax(0, 1fr) 24px' }} {...reorder.target(i)}>
              <span className="tbl-grip" title="Drag to reorder" {...reorder.grip(i)}>
                <DragGrip />
              </span>
              <div className="tbl-cell">
                <Widget kind={kind} name={String(i)} schema={items} root={root} ui={itemUi} value={v} label={`${label} ${i + 1}`} onChange={(x) => onChange(rows.map((y, j) => (j === i ? x : y)))} />
              </div>
              <RowRemove onClick={() => onChange(rows.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
      )}
      <button type="button" className="add-row-btn" onClick={() => onChange([...rows, blankItem(schema.items, root)])}>
        {addLabelFor(schema.title ?? label, ui)}
      </button>
    </div>
  );
}

/** Array of objects without a table layout: one bordered sub-form per item. */
function CardsInput({ schema, root, ui, value, label, onChange }: ArrayProps<Value>) {
  const items = deref(schema.items ?? {}, root);
  const reorder = useReorder(value, onChange);
  return (
    <div className="cards">
      {value.map((row, i) => (
        <div className="card-it" key={i} {...reorder.target(i)}>
          <div className="card-it-h">
            <span className="tbl-grip" title="Drag to reorder" {...reorder.grip(i)}>
              <DragGrip />
            </span>
            <span className="mut">
              {items.title || label} {i + 1}
            </span>
            <RowRemove onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
          <ObjectFields schema={items} root={root} ui={(ui.items ?? {}) as UiSchema} value={row ?? {}} onChange={(r) => onChange(value.map((x, j) => (j === i ? r : x)))} />
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={() => onChange([...value, blankItem(schema.items, root) as Value])}>
        {addLabelFor(schema.title ?? label, ui)}
      </button>
    </div>
  );
}

/** Clone's list of key/value sets: each item is its own Name / Value table. */
function KvListInput({ schema, ui, value, label, onChange }: Omit<ArrayProps<Value>, 'root'>) {
  const itemUi = (ui.items ?? {}) as UiSchema;
  const items = schema.items ?? {};
  const js = !!(items.additionalProperties as JSONSchema | undefined)?.jsExpression;
  return (
    <div className="cards">
      {value.map((row, i) => (
        <div className="card-it" key={i}>
          <div className="card-it-h">
            <span className="mut">
              {schema.title ? addLabelFor(schema.title).replace(/^Add /, '') : label} {i + 1}
            </span>
            <RowRemove onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
          <KeyValueInput value={row ?? {}} ui={itemUi} jsValues={js} label={`${label} ${i + 1}`} onChange={(r) => onChange(value.map((x, j) => (j === i ? r : x)))} />
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={() => onChange([...value, {}])}>
        {addLabelFor(schema.title ?? label, ui)}
      </button>
    </div>
  );
}

/**
 * Object edited as Name / Value rows. Rows live locally so a half-typed or duplicate name does
 * not lose a row; the object is rebuilt from the rows that have a name.
 */
function KeyValueInput({ value, ui, jsValues, label, onChange }: { value: Record<string, unknown>; ui: UiSchema; jsValues: boolean; label: string; onChange: (v: Value) => void }) {
  const text = JSON.stringify(value);
  const toRows = (v: Record<string, unknown>): [string, string][] => (Object.keys(v).length ? Object.entries(v).map(([k, x]) => [k, str(x)]) : [['', '']]);
  const [rows, setRows] = useState<[string, string][]>(() => toRows(value));
  const [synced, setSynced] = useState(text);
  if (text !== synced) {
    setSynced(text);
    setRows(toRows(value));
  }
  const emit = (next: [string, string][]) => {
    setRows(next);
    const obj = Object.fromEntries(next.filter(([k]) => k.trim() !== ''));
    setSynced(JSON.stringify(obj));
    onChange(obj);
  };
  const keyPh: string = ui.key?.['ui:placeholder'] ?? 'Enter field name';
  const valPh: string = ui.value?.['ui:placeholder'] ?? 'Enter value';
  const valTitle: string = ui.value?.['ui:title'] ?? 'Value';
  const template = 'minmax(0, 1fr) minmax(0, 2fr) 24px';
  return (
    <div className="tbl-wrap">
      {rows.length > 0 && (
        <div className="tbl">
          <div className="tbl-row tbl-head" style={{ gridTemplateColumns: template }}>
            <span>Name</span>
            <span>{valTitle}</span>
            <span />
          </div>
          {rows.map(([k, v], i) => (
            <div className="tbl-row" key={i} style={{ gridTemplateColumns: template }}>
              <div className="tbl-cell">
                <input className="in" aria-label={`${label} name ${i + 1}`} placeholder={keyPh} value={k} onChange={(e) => emit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
              </div>
              <div className="tbl-cell">
                {jsValues ? (
                  <JsInput label={`${label} value ${i + 1}`} placeholder={valPh} value={v} onChange={(x) => emit(rows.map((r, j) => (j === i ? [r[0], x] : r)))} />
                ) : (
                  <input className="in" aria-label={`${label} value ${i + 1}`} placeholder={valPh} value={v} onChange={(e) => emit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                )}
              </div>
              <RowRemove onClick={() => emit(rows.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
      )}
      <button type="button" className="add-row-btn" onClick={() => emit([...rows, ['', '']])}>
        Add Field
      </button>
    </div>
  );
}

/** Free-form JSON for the rare property with no structured schema; applies when it parses. */
function JsonInput({ value, label, onChange }: { value: unknown; label: string; onChange: (v: unknown) => void }) {
  const text = value === undefined ? '' : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(text);
  const [base, setBase] = useState(text);
  const [error, setError] = useState('');
  if (text !== base) {
    setBase(text);
    setDraft(text);
    setError('');
  }
  return (
    <>
      <textarea
        className={`in mono${error ? ' bad' : ''}`}
        rows={Math.min(10, Math.max(2, draft.split('\n').length))}
        aria-label={label}
        value={draft}
        placeholder="JSON"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() === '') return onChange(undefined);
          try {
            onChange(JSON.parse(draft));
            setError('');
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error && <div className="err-text">{error}</div>}
    </>
  );
}

/**
 * Cribl's expression input: the outlined “JS” box, Monaco-like colouring (drawn under a
 * transparent input so caret and selection stay native), and a button that opens a larger editor.
 */
export function JsInput({
  value,
  onChange,
  label,
  placeholder,
  popup = true,
  prefix = 'JS',
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  popup?: boolean;
  prefix?: 'JS' | 'G';
}) {
  const [scroll, setScroll] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const track = (e: { currentTarget: HTMLInputElement }) => setScroll(e.currentTarget.scrollLeft);
  return (
    <div className="js-in">
      <span className={`js-pre${prefix === 'G' ? ' grok' : ''}`}>{prefix}</span>
      <div className="js-box">
        <div className="js-hl" aria-hidden style={{ transform: `translateX(${-scroll}px)` }}>
          {prefix === 'JS' ? <Js code={value} /> : value}
        </div>
        <input
          className="mono"
          value={value}
          placeholder={placeholder}
          aria-label={label}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            track(e);
          }}
          onScroll={track}
          onKeyUp={track}
          onSelect={track}
        />
      </div>
      {popup && (
        <button type="button" className="js-x" aria-label={`Open ${label} in the expression editor`} title="Expression editor" onClick={() => setEditing(value)}>
          <ArrowUpRightFromSquare />
        </button>
      )}
      {editing !== null && (
        <Modal
          isOpen
          title="Expression Editor"
          confirmButtonText="Save"
          cancelButtonText="Cancel"
          onIsOpenChange={(open) => !open && setEditing(null)}
          onClose={() => setEditing(null)}
          onConfirm={() => {
            onChange(editing.replace(/\n+$/, ''));
            setEditing(null);
          }}
        >
          <textarea className="in mono expr-ed" rows={10} value={editing} aria-label={`${label} expression`} spellCheck={false} onChange={(e) => setEditing(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}

export function RowRemove({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="row-x" aria-label="Remove row" title="Remove" onClick={onClick}>
      ×
    </button>
  );
}

const LINE = 22;

/**
 * Cribl's multi-line code box (Code, Grok pattern…): colouring drawn under a transparent
 * textarea, so editing, selection and undo stay native. Grows with the code when `grow` is set.
 */
function CodeEditor({
  value,
  onChange,
  js,
  lines,
  grow,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  js: boolean;
  lines: number;
  grow: boolean;
  label: string;
  placeholder?: string;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  const count = value.split('\n').length;
  const rows = grow ? Math.min(30, Math.max(lines, count)) : lines;
  return (
    <div className="code-ed" style={{ height: rows * LINE + 3 }}>
      {js && <span className="js-pre">JS</span>}
      <div className="code-box">
        <pre className="code-hl" aria-hidden style={{ transform: `translate(${-pos.left}px, ${-pos.top}px)` }}>
          {js ? <Js code={value} /> : value}
          {'\n'}
        </pre>
        <textarea
          value={value}
          aria-label={label}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => setPos({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
        />
      </div>
      <div className="code-tools">
        <button type="button" className="js-x" aria-label={`Copy ${label}`} title="Copy" onClick={() => void navigator.clipboard?.writeText(value)}>
          <Copy />
        </button>
        <button type="button" className="js-x" aria-label={`Open ${label} in the editor`} title="Expand" onClick={() => setEditing(value)}>
          <ArrowUpRightFromSquare />
        </button>
      </div>
      {editing !== null && (
        <Modal
          isOpen
          title={js ? 'Code Editor' : label}
          confirmButtonText="Save"
          cancelButtonText="Cancel"
          onIsOpenChange={(open) => !open && setEditing(null)}
          onClose={() => setEditing(null)}
          onConfirm={() => {
            onChange(editing);
            setEditing(null);
          }}
        >
          <textarea className="in mono expr-ed" rows={20} value={editing} aria-label={`${label} code`} spellCheck={false} wrap="off" onChange={(e) => setEditing(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}

/** `/body/flags` → parts; a value without slashes is all body. */
function splitRegex(v: string): { body: string; flags: string } {
  const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(v);
  return m ? { body: m[1], flags: m[2] } : { body: v, flags: '' };
}

const RX_TOKEN = /(\\.|\[(?:\\.|[^\]\\])*\]|\((?:\?(?:<[A-Za-z_]\w*>|<[=!]|[:=!]))?|\)|[*+?]\??|\{\d+(?:,\d*)?\}\??)/g;

/** Regex colouring as in Cribl: groups green, character classes orange, escapes and quantifiers bold. */
function RegexHl({ code }: { code: string }) {
  return (
    <>
      {code.split(RX_TOKEN).map((p, i) => {
        if (!p) return null;
        if (i % 2 === 0) return <span key={i}>{p}</span>;
        const cls = p[0] === '[' ? 'rx-cls' : p[0] === '(' || p === ')' ? 'rx-grp' : p[0] === '\\' ? 'rx-esc' : 'rx-q';
        return (
          <span key={i} className={cls}>
            {p}
          </span>
        );
      })}
    </>
  );
}

/** Cribl's regex input: “R” box, fixed `/ … /flags` frame, coloured pattern. */
function RegexInput({ value, onChange, label, placeholder, popup = true }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; popup?: boolean }) {
  const [scroll, setScroll] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const flagsId = useId();
  const { body, flags } = splitRegex(value);
  const set = (b: string, f: string) => onChange(b || f ? `/${b}/${f}` : '');
  const track = (e: { currentTarget: HTMLInputElement }) => setScroll(e.currentTarget.scrollLeft);
  return (
    <div className="js-in rx-in">
      <span className="js-pre">R</span>
      <span className="rx-sl">/</span>
      <div className="js-box">
        <div className="js-hl" aria-hidden style={{ transform: `translateX(${-scroll}px)` }}>
          <RegexHl code={body} />
        </div>
        <input
          className="mono"
          value={body}
          placeholder={placeholder}
          aria-label={label}
          spellCheck={false}
          onChange={(e) => {
            set(e.target.value, flags);
            track(e);
          }}
          onScroll={track}
          onKeyUp={track}
          onSelect={track}
        />
      </div>
      <span className="rx-sl">/</span>
      <input
        id={flagsId}
        className="rx-flags mono"
        value={flags}
        size={Math.max(1, flags.length)}
        aria-label={`${label} flags`}
        title="Regex flags (g, i, m, s, u, y)"
        onChange={(e) => set(body, [...new Set(e.target.value.replace(/[^dgimsuy]/g, ''))].join(''))}
      />
      <label htmlFor={flagsId} className="js-x rx-flag" title="Regex flags (g, i, m, s, u, y)">
        <FlagOutlined />
      </label>
      {popup && (
        <button type="button" className="js-x" aria-label={`Open ${label} in the regex editor`} title="Regex editor" onClick={() => setEditing(body)}>
          <ArrowUpRightFromSquare />
        </button>
      )}
      {editing !== null && (
        <Modal
          isOpen
          title="Regex Editor"
          confirmButtonText="Save"
          cancelButtonText="Cancel"
          onIsOpenChange={(open) => !open && setEditing(null)}
          onClose={() => setEditing(null)}
          onConfirm={() => {
            set(editing.replace(/\n+$/, ''), flags);
            setEditing(null);
          }}
        >
          <textarea className="in mono expr-ed" rows={8} value={editing} aria-label={`${label} pattern`} spellCheck={false} onChange={(e) => setEditing(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}

/** Cribl's chip input: Enter, comma or blur turns the typed text into chips. */
export function TagsInput({ value, placeholder, label, onChange }: { value: string[]; placeholder?: string; label: string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft('');
  };
  return (
    <div className="in tags">
      {value.map((t, i) => (
        <span className="chip" key={`${t}-${i}`}>
          <span className="chip-grip">
            <DragGrip />
          </span>
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <CloseOutlined />
          </button>
        </span>
      ))}
      <input
        value={draft}
        aria-label={label}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
