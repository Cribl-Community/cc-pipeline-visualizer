// Turns Cribl's function JSON schemas (react-jsonschema-form dialect plus Cribl uischema
// extensions) into what the settings form needs: the active properties for the current
// values, defaults, and which widget each property gets.

export interface JSONSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  /** What a newly added function starts with, when it differs from `default` (e.g. OTLP version). */
  defaultNew?: unknown;
  enum?: unknown[];
  enumNames?: string[];
  const?: unknown;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  dependencies?: Record<string, JSONSchema | string[]>;
  oneOf?: JSONSchema[];
  definitions?: Record<string, JSONSchema>;
  $ref?: string;
  additionalProperties?: boolean | JSONSchema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  minLength?: number;
  readOnly?: boolean;
  jsExpression?: boolean | string;
  regexp?: boolean;
}

// The uischema is loosely typed by nature: `ui:*` keys plus nested per-property entries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UiSchema = Record<string, any>;
export type Value = Record<string, unknown>;

export interface Resolved {
  properties: [string, JSONSchema][];
  required: Set<string>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isEmptySchema = (s?: JSONSchema) => !s || Object.keys(s).length === 0;

/** Follows a local `#/definitions/x` reference; sibling keys override the referenced ones. */
export function deref(s: JSONSchema, root: JSONSchema): JSONSchema {
  if (!s.$ref) return s;
  const name = s.$ref.replace(/^#\/definitions\//, '');
  const { $ref: _ref, ...rest } = s;
  void _ref;
  return { ...deref(root.definitions?.[name] ?? {}, root), ...rest };
}

const typeOf = (s: JSONSchema) => (Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type);

function branchMatches(b: JSONSchema, key: string, val: unknown): boolean {
  const p = b.properties?.[key];
  if (!p) return false;
  if (p.enum) return p.enum.some((e) => e === val);
  if ('const' in p) return p.const === val;
  return false;
}

/**
 * Active properties for `value`: base properties merged with every `dependencies` branch whose
 * condition holds, the way react-jsonschema-form does it. Merged keys keep the position of
 * their `{}` placeholder; new ones are appended. Placeholders nothing fills are dropped.
 */
export function resolve(schema: JSONSchema, value: Value, root: JSONSchema = schema): Resolved {
  const props: Record<string, JSONSchema> = { ...(schema.properties ?? {}) };
  const required = new Set(schema.required ?? []);
  const queue = Object.entries(schema.dependencies ?? {});
  const current = (k: string) => value[k] ?? deref(props[k] ?? {}, root).default;

  for (let i = 0; i < queue.length && i < 100; i++) {
    const [key, dep] = queue[i];
    if (Array.isArray(dep)) {
      if (value[key] !== undefined) dep.forEach((r) => required.add(r));
      continue;
    }
    let branch: JSONSchema | undefined;
    if (dep.oneOf) branch = dep.oneOf.find((b) => branchMatches(b, key, current(key)));
    else if (current(key) !== undefined) branch = dep;
    if (!branch) continue;
    for (const [k, p] of Object.entries(branch.properties ?? {})) {
      // The branch's copy of the trigger only restates the enum; keep the base definition.
      if (k === key && !isEmptySchema(props[k])) continue;
      props[k] = p;
    }
    branch.required?.forEach((r) => required.add(r));
    queue.push(...Object.entries(branch.dependencies ?? {}));
  }

  const properties = Object.entries(props)
    .filter(([, p]) => !isEmptySchema(p))
    .map(([k, p]) => [k, deref(p, root)] as [string, JSONSchema]);
  return { properties, required };
}

/** Every property name any branch can produce; used to prune values a branch switch hides. */
export function allPropertyNames(schema: JSONSchema): Set<string> {
  const out = new Set(Object.keys(schema.properties ?? {}));
  const walk = (deps?: JSONSchema['dependencies']) => {
    for (const dep of Object.values(deps ?? {})) {
      if (Array.isArray(dep)) continue;
      for (const b of dep.oneOf ?? [dep]) {
        Object.keys(b.properties ?? {}).forEach((k) => out.add(k));
        walk(b.dependencies);
      }
    }
  };
  walk(schema.dependencies);
  return out;
}

/** The starting value for something newly added: `defaultNew` wins over `default`. */
const newDefault = (s: JSONSchema) => (s.defaultNew !== undefined ? s.defaultNew : s.default);

/** An empty array item: its own defaults, or `{}` for key-value items. */
export function blankItem(items: JSONSchema | undefined, root: JSONSchema): unknown {
  const it = items ? deref(items, root) : {};
  if (typeOf(it) === 'object' || it.properties) return defaultsFor(it, root, {});
  if (newDefault(it) !== undefined) return structuredClone(newDefault(it));
  return typeOf(it) === 'number' || typeOf(it) === 'integer' ? undefined : '';
}

/**
 * Defaults for a new function (or array item), including properties that only exist once a
 * defaulted value selects a dependency branch. Arrays of objects with `minItems` get blank rows.
 */
export function defaultsFor(schema: JSONSchema, root: JSONSchema = schema, seed: Value = {}): Value {
  let out: Value = { ...seed };
  for (let pass = 0; pass < 4; pass++) {
    const before = JSON.stringify(out);
    for (const [k, p] of resolve(schema, out, root).properties) {
      if (out[k] !== undefined) continue;
      if (newDefault(p) !== undefined) out[k] = structuredClone(newDefault(p));
      else if (typeOf(p) === 'object' && p.properties) {
        const nested = defaultsFor(p, root);
        if (Object.keys(nested).length) out[k] = nested;
      } else if (typeOf(p) === 'array' && (p.minItems ?? 0) > 0 && p.items && typeOf(deref(p.items, root)) === 'object') {
        out[k] = Array.from({ length: p.minItems! }, () => blankItem(p.items, root));
      }
    }
    if (JSON.stringify(out) === before) break;
    out = { ...out };
  }
  return out;
}

/**
 * Applies one property change, then drops values the new branch no longer shows and fills in
 * defaults for ones it newly shows, so switching e.g. a Parser's type behaves like Cribl.
 */
export function applyChange(schema: JSONSchema, value: Value, key: string, next: unknown, root: JSONSchema = schema): Value {
  const out: Value = { ...value };
  if (next === undefined) delete out[key];
  else out[key] = next;
  if (!schema.dependencies) return out;
  const before = new Set(resolve(schema, value, root).properties.map(([k]) => k));
  const after = resolve(schema, out, root);
  const active = new Set(after.properties.map(([k]) => k));
  for (const k of allPropertyNames(schema)) if (!active.has(k) && k in out) delete out[k];
  for (const [k, p] of after.properties) {
    if (!before.has(k) && out[k] === undefined && newDefault(p) !== undefined) out[k] = structuredClone(newDefault(p));
  }
  return out;
}

export type Kind =
  | 'hidden'
  | 'select'
  | 'radio'
  | 'bool'
  | 'number'
  | 'text'
  | 'textarea'
  | 'js'
  | 'jscode'
  | 'regex'
  | 'grok'
  | 'code'
  | 'lookup'
  | 'label'
  | 'tags'
  | 'list'
  | 'table'
  | 'cards'
  | 'kvlist'
  | 'kv'
  | 'object'
  | 'json';

const JS_WIDGETS = new Set(['JsInput', 'JsInputWithoutPopup', 'AggInput']);
const REGEX_WIDGETS = new Set(['RegexInput', 'RegexInputWithoutPopup']);
const LOOKUP_WIDGETS = new Set(['ApiLookup', 'ApiLookupWithLink', 'ApiLookupWithCreate', 'AutoComplete', 'SecretLookupWithCreate']);

/** Which control a property gets, from its schema type and Cribl's `ui:widget` / `ui:field`. */
export function kindOf(s: JSONSchema, ui: UiSchema = {}, root?: JSONSchema): Kind {
  const widget = ui['ui:widget'];
  const field = ui['ui:field'];
  const opts = uiOptions(ui);
  if (widget === 'hidden') return 'hidden';
  if (s.enum) return widget === 'Radio' ? 'radio' : 'select';
  const t = typeOf(s);
  if (t === 'boolean') return 'bool';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'array') {
    const it = s.items ? (root ? deref(s.items, root) : s.items) : {};
    if (typeOf(it) === 'object' || it.properties || it.additionalProperties) {
      if (ui.items?.['ui:field'] === 'KeyValue' || (!it.properties && isObj(it.additionalProperties))) return 'kvlist';
      return field === 'Table' ? 'table' : 'cards';
    }
    // Plain string arrays are chips unless items get their own widget (e.g. Aggregates' AggInput).
    return field !== 'Tags' && ui.items?.['ui:widget'] ? 'list' : 'tags';
  }
  if (t === 'object' || s.properties) {
    if (s.properties && Object.keys(s.properties).length) return 'object';
    if (field === 'KeyValue' || isObj(s.additionalProperties)) return 'kv';
    return 'json';
  }
  if (t !== 'string' && t !== undefined) return 'json';
  if (t === undefined && !widget) return 'hidden';
  if (widget === 'textarea') return 'textarea';
  if (widget === 'GrokInput') return 'grok';
  if (widget === 'Label' || s.readOnly) return 'label';
  // An explicit picker wins over the schema's JS/regex marker (Cribl Guard's mitigation expression).
  if (LOOKUP_WIDGETS.has(widget)) return 'lookup';
  if (JS_WIDGETS.has(widget) || s.jsExpression) return (opts.numLines ?? 1) > 1 ? 'jscode' : 'js';
  if (REGEX_WIDGETS.has(widget) || s.regexp) return 'regex';
  return 'text';
}

/**
 * Evaluates the few `ui:options` Cribl writes as a JS expression over `conf`, e.g.
 * `{ inline: true, width: conf.type === 'kvp' ? '40%' : '60%' }`. Only literals, `conf.x`,
 * (in)equality and `?:` are understood — no eval. Returns undefined when it can't parse.
 */
export function evalOptions(src: string, conf: Value): unknown {
  const toks = src.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|!==|===|!=|==|-?\d+(?:\.\d+)?|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const take = (t?: string) => {
    if (t !== undefined && toks[i] !== t) throw new Error(`expected ${t}`);
    return toks[i++];
  };
  const primary = (): unknown => {
    const t = take();
    if (t === undefined) throw new Error('end');
    if (t === '(') {
      const v = ternary();
      take(')');
      return v;
    }
    if (t === '{') {
      const o: Record<string, unknown> = {};
      while (peek() !== '}') {
        const k = take();
        take(':');
        o[/^['"]/.test(k) ? k.slice(1, -1) : k] = ternary();
        if (peek() === ',') take();
      }
      take('}');
      return o;
    }
    if (t === '[') {
      const a: unknown[] = [];
      while (peek() !== ']') {
        a.push(ternary());
        if (peek() === ',') take();
      }
      take(']');
      return a;
    }
    if (/^['"]/.test(t)) return t.slice(1, -1).replace(/\\(.)/g, '$1');
    if (/^-?\d/.test(t)) return Number(t);
    if (t === 'true' || t === 'false') return t === 'true';
    if (t === 'null' || t === 'undefined') return t === 'null' ? null : undefined;
    if (t.startsWith('conf.'))
      return t
        .slice(5)
        .split('.')
        .reduce<unknown>((v, k) => (isObj(v) ? v[k] : undefined), conf);
    throw new Error(`unexpected ${t}`);
  };
  const equality = (): unknown => {
    const l = primary();
    const op = peek();
    if (op !== '===' && op !== '==' && op !== '!==' && op !== '!=') return l;
    take();
    const r = primary();
    return op.startsWith('!') ? l !== r : l === r;
  };
  const ternary = (): unknown => {
    const c = equality();
    if (peek() !== '?') return c;
    take();
    const a = ternary();
    take(':');
    const b = ternary();
    return c ? a : b;
  };
  try {
    const v = ternary();
    return i === toks.length ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The uischema with expression-form `ui:options` (its own and its properties') evaluated against `conf`. */
export function withConf(ui: UiSchema, conf: Value): UiSchema {
  const fix = (u: unknown) => (isObj(u) && typeof u['ui:options'] === 'string' ? { ...u, 'ui:options': evalOptions(u['ui:options'], conf) ?? {} } : u);
  let out: UiSchema | undefined;
  for (const [k, u] of Object.entries(ui)) {
    const f = fix(u);
    if (f !== u) (out ??= { ...ui })[k] = f;
  }
  return fix(out ?? ui) as UiSchema;
}

/** `ui:options`; expression strings must have been resolved with `withConf` first. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function uiOptions(ui: UiSchema = {}): Record<string, any> {
  const o = ui['ui:options'];
  return isObj(o) ? o : {};
}

export interface Group {
  key: string;
  title: string;
  collapsed: boolean;
  description?: string;
  properties: string[];
}

/** Cribl's collapsible sections (“Advanced Settings” and friends) from `ui:options.groups`. */
export function groupsOf(ui: UiSchema = {}): Group[] {
  const g = uiOptions(ui).groups;
  if (!isObj(g)) return [];
  return Object.entries(g).map(([key, v]) => {
    const o = (isObj(v) ? v : {}) as { title?: string; collapsed?: boolean; description?: string; properties?: string[] };
    return { key, title: o.title ?? key, collapsed: o.collapsed !== false, description: o.description, properties: o.properties ?? [] };
  });
}

/** Field label: `ui:title` wins (false hides it), then the schema title, then the key. */
export function labelOf(key: string, s: JSONSchema, ui: UiSchema = {}): string | null {
  const t = ui['ui:title'];
  if (t === false) return null;
  if (typeof t === 'string') return t;
  return s.title || key;
}

/** Cribl writes the product name as a template token in help text. */
export const helpText = (s?: string) => s?.replace(/@\{product\}/g, 'Cribl');

/** “Evaluate fields” → “Add Field”, “Masking rules” → “Add Rule”, matching Cribl's buttons. */
export function addLabelFor(title: string, ui: UiSchema = {}): string {
  const explicit = uiOptions(ui).addLabel;
  if (typeof explicit === 'string') return explicit;
  const last = (title.trim().split(/\s+/).pop() || 'item').replace(/ies$/i, 'y').replace(/(?<!s)s$/i, '');
  return `Add ${last.charAt(0).toUpperCase()}${last.slice(1)}`;
}

/** Whether a required value is missing, for the red border. */
export function isMissing(s: JSONSchema, v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return (s.minLength ?? 1) > 0 && v.trim() === '';
  if (Array.isArray(v)) return v.length < (s.minItems ?? 0);
  return false;
}
