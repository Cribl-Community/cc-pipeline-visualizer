import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLabelFor, applyChange, defaultsFor, evalOptions, kindOf, resolve, type JSONSchema } from './schemaForm';

// Trimmed copy of the shape Cribl's Parser (serde) schema uses: placeholders, $ref, oneOf branches.
const serde: JSONSchema = {
  type: 'object',
  definitions: { srcField: { type: 'string', title: 'Source field', default: '_raw' } },
  properties: {
    mode: { type: 'string', enum: ['extract', 'reserialize'], default: 'extract' },
    type: { type: 'string', enum: ['auto', 'csv'], default: 'auto' },
    delimChar: {},
    srcField: {},
  },
  dependencies: {
    type: {
      oneOf: [{ properties: { type: { enum: ['auto'] } } }, { properties: { type: { enum: ['csv'] }, srcField: { $ref: '#/definitions/srcField' }, delimChar: { type: 'string', default: ',' } } }],
    },
  },
};

test('resolve keeps only the active branch and follows $ref', () => {
  assert.deepEqual(
    resolve(serde, {}).properties.map(([k]) => k),
    ['mode', 'type'],
  );
  const csv = resolve(serde, { type: 'csv' }).properties;
  assert.deepEqual(
    csv.map(([k]) => k),
    ['mode', 'type', 'delimChar', 'srcField'],
  );
  assert.equal(csv.find(([k]) => k === 'srcField')![1].default, '_raw');
});

test('defaultsFor follows defaults into dependency branches and seeds minItems rows', () => {
  assert.deepEqual(defaultsFor(serde), { mode: 'extract', type: 'auto' });
  const mask: JSONSchema = { properties: { rules: { type: 'array', minItems: 1, items: { type: 'object', properties: { replaceExpr: { type: 'string', default: "''" } } } } } };
  assert.deepEqual(defaultsFor(mask), { rules: [{ replaceExpr: "''" }] });
});

test('applyChange prunes values of the old branch and fills the new one', () => {
  const csv = applyChange(serde, { mode: 'extract', type: 'auto' }, 'type', 'csv');
  assert.deepEqual(csv, { mode: 'extract', type: 'csv', delimChar: ',', srcField: '_raw' });
  assert.deepEqual(applyChange(serde, csv, 'type', 'auto'), { mode: 'extract', type: 'auto' });
});

test('kindOf maps Cribl widgets', () => {
  assert.equal(kindOf({ type: 'string', jsExpression: true }), 'js');
  assert.equal(kindOf({ type: 'string' }, { 'ui:widget': 'RegexInput' }), 'regex');
  assert.equal(kindOf({ type: 'array', items: { type: 'string' } }, { 'ui:field': 'Tags' }), 'tags');
  assert.equal(kindOf({ type: 'array', items: { type: 'string' } }, { items: { 'ui:widget': 'AggInput' } }), 'list');
  assert.equal(kindOf({ type: 'array', items: { type: 'object', properties: { a: {} } } }, { 'ui:field': 'Table' }), 'table');
  assert.equal(kindOf({ type: 'array', items: { type: 'object', additionalProperties: { type: 'string' } } }), 'kvlist');
  assert.equal(kindOf({ type: 'string', enum: ['a'] }, { 'ui:widget': 'Radio' }), 'radio');
  assert.equal(kindOf({ type: 'string' }, { 'ui:widget': 'hidden' }), 'hidden');
});

test('addLabelFor matches Cribl button text', () => {
  assert.equal(addLabelFor('Evaluate fields'), 'Add Field');
  assert.equal(addLabelFor('Masking rules'), 'Add Rule');
  assert.equal(addLabelFor('Aggregates'), 'Add Aggregate');
  assert.equal(addLabelFor('Additional fields', { 'ui:options': { addLabel: 'Add Metric' } }), 'Add Metric');
});

test('evalOptions evaluates Cribl expression-form ui:options against conf', () => {
  const src = "{ inline: true, width: conf.type === 'kvp' ? '40%' : '60%' }";
  assert.deepEqual(evalOptions(src, { type: 'kvp' }), { inline: true, width: '40%' });
  assert.deepEqual(evalOptions(src, { type: 'csv' }), { inline: true, width: '60%' });
  const groups = "conf.existingOrNew == 'new' ? { groups: { a: { title: 'A', properties: ['x', 'y'] } } } : { groups: {} }";
  assert.deepEqual(evalOptions(groups, { existingOrNew: 'new' }), { groups: { a: { title: 'A', properties: ['x', 'y'] } } });
  assert.deepEqual(evalOptions(groups, {}), { groups: {} });
});

test('evalOptions rejects anything outside the literal subset', () => {
  assert.equal(evalOptions('alert(1)', {}), undefined);
  assert.equal(evalOptions('{ a: 1 } + 2', {}), undefined);
});

test('defaultsFor prefers defaultNew for newly added functions', () => {
  const s: JSONSchema = {
    properties: {
      otlpVersion: { type: 'string', enum: ['0.10.0', '1.3.1'], default: '0.10.0', defaultNew: '1.3.1' },
      prefixes: { type: 'array', items: { type: 'string' }, default: ['service'], defaultNew: [] },
    },
  };
  assert.deepEqual(defaultsFor(s), { otlpVersion: '1.3.1', prefixes: [] });
});

test('kindOf: an explicit picker beats jsExpression; GrokInput is a one-line input', () => {
  assert.equal(kindOf({ type: 'string', jsExpression: true }, { 'ui:widget': 'AutoComplete' }), 'lookup');
  assert.equal(kindOf({ type: 'string' }, { 'ui:widget': 'GrokInput' }), 'grok');
});
