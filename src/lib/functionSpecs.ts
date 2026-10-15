// Hand-built settings forms for the most-used Cribl functions. Field keys, titles and
// defaults follow each function's schema from GET /p/{pack}/functions.

export type Conf = Record<string, unknown>;

export interface ColSpec {
  k: string;
  label: string;
  t: 'text' | 'expr' | 'number' | 'enabled';
  width?: string;
  placeholder?: string;
  def?: unknown;
}

interface Base {
  k: string;
  label: string;
  help?: string;
  placeholder?: string;
  advanced?: boolean;
  show?: (c: Conf) => boolean;
}

export type FieldSpec =
  | (Base & { t: 'text' | 'expr' | 'regex' })
  | (Base & { t: 'code'; rows?: number })
  | (Base & { t: 'number'; min?: number; max?: number })
  | (Base & { t: 'bool' })
  | (Base & { t: 'select'; options: [string, string][] })
  | (Base & { t: 'tags' })
  | (Base & { t: 'list'; addLabel: string; mono?: boolean })
  | (Base & { t: 'table'; cols: ColSpec[]; addLabel: string });

export interface FunctionSpec {
  id: string;
  name: string;
  group: 'Standard' | 'Advanced' | 'Formatters';
  fields: FieldSpec[];
  defaults: Conf;
}

const keepRemove = (show?: (c: Conf) => boolean): FieldSpec[] => [
  { t: 'tags', k: 'keep', label: 'Fields to keep', placeholder: 'Enter field names', show },
  { t: 'tags', k: 'remove', label: 'Fields to remove', placeholder: 'Enter field names', show },
  { t: 'expr', k: 'fieldFilterExpr', label: 'Fields filter expression', placeholder: "e.g. value !== null", show },
];

const evalTable = (k: string, label: string, withEnabled: boolean): FieldSpec => ({
  t: 'table',
  k,
  label,
  addLabel: 'Add Field',
  cols: [
    { k: 'name', label: 'Name', t: 'text', width: '28%', placeholder: 'Enter field name' },
    { k: 'value', label: 'Value Expression', t: 'expr', placeholder: 'Enter value expression' },
    ...(withEnabled ? [{ k: 'disabled', label: 'Enabled', t: 'enabled' as const, width: '70px', def: false }] : []),
  ],
});

const regexList: FieldSpec = {
  t: 'table',
  k: 'regexList',
  label: 'Additional regex',
  addLabel: 'Add Regex',
  cols: [{ k: 'regex', label: 'Regex', t: 'expr', placeholder: '/(?<name>pattern)/' }],
};

const is = (key: string, ...values: unknown[]) => (c: Conf) => values.includes(c[key]);
const SERDE_TYPES: [string, string][] = [
  ['auto', 'Auto'],
  ['csv', 'CSV'],
  ['elff', 'Extended Log File Format'],
  ['clf', 'Common Log Format'],
  ['kvp', 'Key=Value Pairs'],
  ['json', 'JSON Object'],
  ['delim', 'Delimited values'],
  ['regex', 'Regular Expression'],
  ['grok', 'Grok'],
];
const delimFields = (show: (c: Conf) => boolean): FieldSpec[] => [
  { t: 'text', k: 'delimChar', label: 'Delimiter', show },
  { t: 'text', k: 'quoteChar', label: 'Quote char', show },
  { t: 'text', k: 'escapeChar', label: 'Escape char', show },
  { t: 'text', k: 'nullValue', label: 'Null value', show },
];

export const FUNCTION_SPECS: FunctionSpec[] = [
  {
    id: 'eval',
    name: 'Eval',
    group: 'Standard',
    defaults: { add: [] },
    fields: [
      evalTable('add', 'Evaluate fields', true),
      { t: 'tags', k: 'keep', label: 'Keep fields', placeholder: 'Enter field names' },
      { t: 'tags', k: 'remove', label: 'Remove fields', placeholder: 'Enter field names' },
      { t: 'bool', k: 'printUndefineds', label: 'Print undefined as null', advanced: true },
    ],
  },
  { id: 'drop', name: 'Drop', group: 'Standard', defaults: {}, fields: [] },
  {
    id: 'regex_extract',
    name: 'Regex Extract',
    group: 'Standard',
    defaults: { regex: '', source: '_raw' },
    fields: [
      { t: 'regex', k: 'regex', label: 'Regex', placeholder: '/(?<fieldName>pattern)/' },
      regexList,
      { t: 'text', k: 'source', label: 'Source field', placeholder: '_raw' },
      { t: 'number', k: 'iterations', label: 'Max exec', min: 1, advanced: true },
      { t: 'expr', k: 'fieldNameExpression', label: 'Field name format expression', advanced: true },
      { t: 'bool', k: 'overwrite', label: 'Overwrite existing fields', advanced: true },
    ],
  },
  {
    id: 'regex_filter',
    name: 'Regex Filter',
    group: 'Standard',
    defaults: { regex: '', field: '_raw' },
    fields: [
      { t: 'regex', k: 'regex', label: 'Regex', placeholder: '/pattern/' },
      regexList,
      { t: 'text', k: 'field', label: 'Field', placeholder: '_raw' },
    ],
  },
  {
    id: 'serde',
    name: 'Parser',
    group: 'Standard',
    defaults: { mode: 'extract', type: 'json', srcField: '_raw' },
    fields: [
      { t: 'select', k: 'mode', label: 'Operation mode', options: [['extract', 'Extract'], ['reserialize', 'Reserialize']] },
      { t: 'select', k: 'type', label: 'Type', options: SERDE_TYPES },
      { t: 'text', k: 'srcField', label: 'Source field', placeholder: '_raw', show: (c) => c.type !== 'auto' },
      { t: 'text', k: 'dstField', label: 'Destination field', placeholder: 'Destination field name', show: (c) => c.type !== 'auto' },
      { t: 'bool', k: 'cleanFields', label: 'Clean fields', show: is('type', 'kvp') },
      ...delimFields(is('type', 'delim')),
      { t: 'tags', k: 'fields', label: 'List of fields', placeholder: 'Enter field names', show: is('type', 'csv', 'elff', 'clf', 'delim') },
      { t: 'regex', k: 'regex', label: 'Regex', placeholder: '/(?<name>pattern)/', show: is('type', 'regex') },
      { ...regexList, show: is('type', 'regex') },
      { t: 'text', k: 'pattern', label: 'Pattern', placeholder: '%{PATTERN_NAME:FIELD_NAME}', show: is('type', 'grok') },
      ...keepRemove(is('type', 'csv', 'elff', 'clf', 'kvp', 'json', 'delim')),
    ],
  },
  {
    id: 'rename',
    name: 'Rename',
    group: 'Standard',
    defaults: { rename: [] },
    fields: [
      { t: 'tags', k: 'baseFields', label: 'Parent fields', placeholder: 'Enter field names' },
      {
        t: 'table',
        k: 'rename',
        label: 'Rename fields',
        addLabel: 'Add Field',
        cols: [
          { k: 'currentName', label: 'Current Name', t: 'text', placeholder: 'Current name' },
          { k: 'newName', label: 'New Name', t: 'text', placeholder: 'New name' },
        ],
      },
      { t: 'expr', k: 'renameExpr', label: 'Rename expression', placeholder: 'name.toLowerCase()' },
      { t: 'number', k: 'wildcardDepth', label: 'Parent field wildcard depth', min: 0, advanced: true },
    ],
  },
  {
    id: 'serialize',
    name: 'Serialize',
    group: 'Formatters',
    defaults: { type: 'json', dstField: '_raw' },
    fields: [
      { t: 'select', k: 'type', label: 'Type', options: SERDE_TYPES.filter(([v]) => !['auto', 'regex', 'grok'].includes(v)) },
      { t: 'tags', k: 'fields', label: 'Fields to serialize', placeholder: 'Enter field names (wildcards allowed)' },
      { t: 'text', k: 'srcField', label: 'Source field', placeholder: 'Leave empty to use top-level fields' },
      { t: 'text', k: 'dstField', label: 'Destination field', placeholder: '_raw' },
      { t: 'bool', k: 'cleanFields', label: 'Clean fields', show: is('type', 'kvp') },
      { t: 'text', k: 'pairDelimiter', label: 'Pair delimiter', show: is('type', 'kvp') },
      { t: 'text', k: 'keyValueDelimiter', label: 'Key-Value delimiter', show: is('type', 'kvp') },
      ...delimFields(is('type', 'delim')),
    ],
  },
  {
    id: 'comment',
    name: 'Comment',
    group: 'Standard',
    defaults: { comment: '' },
    fields: [{ t: 'code', k: 'comment', label: 'Comment', rows: 3 }],
  },
  {
    id: 'code',
    name: 'Code',
    group: 'Advanced',
    defaults: { code: '', maxNumOfIterations: 5000, activeLogSampleRate: 1000, useUniqueLogChannel: true },
    fields: [
      { t: 'code', k: 'code', label: 'Code', rows: 8, placeholder: '// __e is the event\n__e.newField = 1;' },
      { t: 'number', k: 'maxNumOfIterations', label: 'Iteration limit', min: 1, max: 100000, advanced: true },
      { t: 'number', k: 'activeLogSampleRate', label: 'Error log sample rate', min: 1, max: 5000, advanced: true },
      { t: 'bool', k: 'useUniqueLogChannel', label: 'Use unique log channel', advanced: true },
    ],
  },
  {
    id: 'lookup',
    name: 'Lookup',
    group: 'Standard',
    defaults: { file: '', matchMode: 'exact', inFields: [], outFields: [] },
    fields: [
      { t: 'text', k: 'file', label: 'Lookup file path (.csv, .csv.gz)', placeholder: 'e.g. lookup.csv' },
      { t: 'select', k: 'matchMode', label: 'Match mode', options: [['exact', 'Exact'], ['cidr', 'CIDR'], ['regex', 'Regex']], show: (c) => !c.dbLookup },
      { t: 'select', k: 'matchType', label: 'Match type', options: [['first', 'First'], ['specific', 'Specific'], ['all', 'All']], show: (c) => !c.dbLookup && c.matchMode !== 'exact' },
      {
        t: 'table',
        k: 'inFields',
        label: 'Lookup fields',
        addLabel: 'Add Field',
        cols: [
          { k: 'eventField', label: 'Lookup Field Name in Event', t: 'text' },
          { k: 'lookupField', label: 'Corresponding Field Name in Lookup', t: 'text' },
        ],
      },
      {
        t: 'table',
        k: 'outFields',
        label: 'Output fields',
        addLabel: 'Add Field',
        cols: [
          { k: 'lookupField', label: 'Output Field Name from Lookup', t: 'text' },
          { k: 'eventField', label: 'Lookup Field Name in Event', t: 'text' },
          { k: 'defaultValue', label: 'Default Value', t: 'text', width: '20%' },
        ],
      },
      { t: 'bool', k: 'ignoreCase', label: 'Ignore case', show: (c) => !c.dbLookup && c.matchMode !== 'cidr' },
      { t: 'bool', k: 'dbLookup', label: 'Use Disk-Based Lookup', advanced: true },
      { t: 'bool', k: 'addToEvent', label: 'Add to raw event', advanced: true },
      { t: 'number', k: 'reloadPeriodSec', label: 'Reload period (sec)', advanced: true, show: (c) => !c.dbLookup },
    ],
  },
  {
    id: 'mask',
    name: 'Mask',
    group: 'Standard',
    defaults: { rules: [{ matchRegex: '', replaceExpr: "''", disabled: false }], fields: ['_raw'], depth: 5 },
    fields: [
      {
        t: 'table',
        k: 'rules',
        label: 'Masking rules',
        addLabel: 'Add Rule',
        cols: [
          { k: 'matchRegex', label: 'Match Regex', t: 'expr', placeholder: '/pattern/g' },
          { k: 'replaceExpr', label: 'Replace Expression', t: 'expr', def: "''" },
          { k: 'disabled', label: 'Enabled', t: 'enabled', width: '70px', def: false },
        ],
      },
      { t: 'tags', k: 'fields', label: 'Apply to fields', placeholder: 'Enter field names' },
      { t: 'number', k: 'depth', label: 'Depth', min: 1, advanced: true },
      { ...evalTable('flags', 'Evaluate fields', false), advanced: true },
    ],
  },
  {
    id: 'auto_timestamp',
    name: 'Auto Timestamp',
    group: 'Standard',
    defaults: { srcField: '_raw', dstField: '_time', defaultTimezone: 'local', timeExpression: 'time.getTime() / 1000', offset: 0, maxLen: 150, defaultTime: 'now', latestDateAllowed: '+1week', earliestDateAllowed: '-420weeks' },
    fields: [
      { t: 'text', k: 'srcField', label: 'Source field' },
      { t: 'text', k: 'dstField', label: 'Destination field' },
      { t: 'text', k: 'defaultTimezone', label: 'Default timezone', placeholder: 'local' },
      { t: 'expr', k: 'timeExpression', label: 'Time expression' },
      { t: 'number', k: 'offset', label: 'Start scan offset', min: 0, advanced: true },
      { t: 'number', k: 'maxLen', label: 'Max timestamp scan depth', min: 1, advanced: true },
      { t: 'select', k: 'defaultTime', label: 'Default time', options: [['now', 'Current Time'], ['last', "Last Event's Time"], ['none', 'None']], advanced: true },
      { t: 'text', k: 'latestDateAllowed', label: 'Future timestamp allowed', advanced: true },
      { t: 'text', k: 'earliestDateAllowed', label: 'Earliest timestamp allowed', advanced: true },
      {
        t: 'table',
        k: 'timestamps',
        label: 'Additional timestamps',
        addLabel: 'Add Timestamp',
        advanced: true,
        cols: [
          { k: 'regex', label: 'Regex', t: 'expr' },
          { k: 'strptime', label: 'Strptime format', t: 'text', placeholder: '%Y-%m-%dT%H:%M:%S' },
        ],
      },
    ],
  },
  {
    id: 'flatten',
    name: 'Flatten',
    group: 'Formatters',
    defaults: { fields: [], prefix: '', depth: 5, delimiter: '_' },
    fields: [
      { t: 'tags', k: 'fields', label: 'Fields', placeholder: 'Leave empty to flatten all fields' },
      { t: 'text', k: 'prefix', label: 'Prefix' },
      { t: 'number', k: 'depth', label: 'Depth', min: 1 },
      { t: 'text', k: 'delimiter', label: 'Delimiter' },
    ],
  },
  {
    id: 'numerify',
    name: 'Numerify',
    group: 'Standard',
    defaults: { depth: 5, format: 'none' },
    fields: [
      { t: 'number', k: 'depth', label: 'Depth', min: 0, max: 10 },
      { t: 'tags', k: 'ignoreFields', label: 'Ignore fields', placeholder: 'Enter field names' },
      { t: 'expr', k: 'filterExpr', label: 'Include expression', placeholder: "e.g. name.startsWith('bytes')" },
      { t: 'select', k: 'format', label: 'Format', options: [['none', 'None'], ['fix', 'Fix'], ['floor', 'Floor'], ['ceil', 'Ceil']] },
      { t: 'number', k: 'digits', label: 'Digits', min: 0, max: 20, show: is('format', 'fix') },
    ],
  },
  {
    id: 'sampling',
    name: 'Sampling',
    group: 'Standard',
    defaults: { rules: [{ filter: 'true', rate: 1 }] },
    fields: [
      {
        t: 'table',
        k: 'rules',
        label: 'Sampling rules',
        addLabel: 'Add Rule',
        cols: [
          { k: 'filter', label: 'Filter', t: 'expr', def: 'true' },
          { k: 'rate', label: 'Sampling Rate', t: 'number', width: '120px', def: 1 },
        ],
      },
    ],
  },
  {
    id: 'dynamic_sampling',
    name: 'Dynamic Sampling',
    group: 'Standard',
    defaults: { mode: 'log', keyExpr: '`${host}`', samplePeriod: 30, minEvents: 30, maxSampleRate: 100 },
    fields: [
      { t: 'select', k: 'mode', label: 'Sample mode', options: [['log', 'Logarithmic'], ['sqrt', 'Square Root']] },
      { t: 'expr', k: 'keyExpr', label: 'Sample group key' },
      { t: 'number', k: 'samplePeriod', label: 'Sample period (sec)', advanced: true },
      { t: 'number', k: 'minEvents', label: 'Minimum events', advanced: true },
      { t: 'number', k: 'maxSampleRate', label: 'Sampling rate limit', min: 1, advanced: true },
    ],
  },
  {
    id: 'suppress',
    name: 'Suppress',
    group: 'Standard',
    defaults: { keyExpr: '', allow: 1, suppressPeriodSec: 30, dropEventsMode: true, maxCacheSize: 50000, cacheIdleTimeoutPeriods: 2, numEventsIdleTimeoutTrigger: 10000 },
    fields: [
      { t: 'expr', k: 'keyExpr', label: 'Key expression', placeholder: '`${host}:${source}`' },
      { t: 'number', k: 'allow', label: 'Number to allow', min: 1 },
      { t: 'number', k: 'suppressPeriodSec', label: 'Suppression period (sec)', min: 0 },
      { t: 'bool', k: 'dropEventsMode', label: 'Drop suppressed events' },
      { t: 'number', k: 'maxCacheSize', label: 'Cache size limit', advanced: true },
      { t: 'number', k: 'cacheIdleTimeoutPeriods', label: 'Suppression period timeout', advanced: true },
      { t: 'number', k: 'numEventsIdleTimeoutTrigger', label: 'Num events to trigger cache clean-up', advanced: true },
    ],
  },
  {
    id: 'aggregation',
    name: 'Aggregations',
    group: 'Standard',
    defaults: { timeWindow: '10s', aggregations: ['count()'], cumulative: false, flushOnInputClose: true },
    fields: [
      { t: 'text', k: 'timeWindow', label: 'Time window', placeholder: '10s' },
      { t: 'list', k: 'aggregations', label: 'Aggregates', addLabel: 'Add Aggregate', mono: true, placeholder: 'e.g. sum(bytes).as(total_bytes)' },
      { t: 'tags', k: 'groupbys', label: 'Group by fields', placeholder: 'Enter field names' },
      { ...evalTable('add', 'Evaluate fields', false), advanced: true },
      { t: 'bool', k: 'passthrough', label: 'Passthrough mode', advanced: true },
      { t: 'bool', k: 'preserveGroupBys', label: 'Preserve group by fields', advanced: true },
      { t: 'bool', k: 'sufficientStatsOnly', label: 'Sufficient stats mode', advanced: true },
      { t: 'bool', k: 'metricsMode', label: 'Metrics mode', advanced: true },
      { t: 'text', k: 'prefix', label: 'Output prefix', advanced: true },
      { t: 'number', k: 'flushEventLimit', label: 'Aggregation event limit', min: 1, advanced: true },
      { t: 'text', k: 'flushMemLimit', label: 'Aggregation memory limit', placeholder: 'e.g. 100MB', advanced: true },
      { t: 'bool', k: 'cumulative', label: 'Cumulative aggregations', advanced: true },
      { t: 'text', k: 'lagTolerance', label: 'Lag tolerance', placeholder: '0s', advanced: true, show: (c) => !c.cumulative },
      { t: 'text', k: 'idleTimeLimit', label: 'Idle bucket time limit', placeholder: '10s', advanced: true, show: (c) => !c.cumulative },
      { t: 'bool', k: 'flushOnInputClose', label: 'Flush on stream close', advanced: true },
    ],
  },
  {
    id: 'json_unroll',
    name: 'JSON Unroll',
    group: 'Advanced',
    defaults: { path: '' },
    fields: [
      { t: 'text', k: 'path', label: 'Path', placeholder: 'e.g. allCars' },
      { t: 'text', k: 'name', label: 'New name', placeholder: 'e.g. car' },
    ],
  },
  {
    id: 'grok',
    name: 'Grok',
    group: 'Standard',
    defaults: { pattern: '', source: '_raw', patternList: [] },
    fields: [
      { t: 'text', k: 'pattern', label: 'Pattern', placeholder: '%{IP:client} %{WORD:method}' },
      {
        t: 'table',
        k: 'patternList',
        label: 'Additional Grok patterns',
        addLabel: 'Add Pattern',
        cols: [{ k: 'pattern', label: 'Pattern', t: 'expr' }],
      },
      { t: 'text', k: 'source', label: 'Source field' },
    ],
  },
];

export const SPEC_BY_ID = new Map(FUNCTION_SPECS.map((s) => [s.id, s]));

/** Defaults for a function without a hand-built form, taken from its JSON schema. */
export function schemaDefaults(schema?: Record<string, unknown>): Conf {
  const props = (schema?.properties ?? {}) as Record<string, { default?: unknown }>;
  const out: Conf = {};
  for (const [k, p] of Object.entries(props)) if (p && p.default !== undefined) out[k] = structuredClone(p.default);
  return out;
}
