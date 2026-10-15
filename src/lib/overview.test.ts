import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compact, filterRows, overviewRows, statsById } from './overview';
import type { Pipeline } from './types';

const pl = (id: string, n: number, extra: Partial<Pipeline['conf']> = {}): Pipeline => ({
  id,
  conf: { functions: Array.from({ length: n }, (_, i) => ({ id: i % 2 ? 'comment' : 'eval', conf: {} })), ...extra },
});

test('overview rows follow Cribl’s columns', () => {
  const rows = overviewRows(
    [pl('powershell_optimize', 26, { output: 'default' }), pl('prometheus_metrics', 3, { output: 'default', description: 'Metrics' }), pl('pre', 1)],
    [
      { id: 'default', name: 'PowerShell Events', pipeline: 'powershell_optimize', output: 'default' },
      { id: 'r2', pipeline: 'powershell_optimize', output: 'default' },
    ],
    [
      { id: 'syslog:in', pipeline: 'pre' },
      { id: 'http:in', connections: [{ pipeline: 'pre', output: 's3' }, { output: 'x' }] },
    ],
    new Map([['powershell_optimize', { in: 5, out: 4, dropped: 1, err: 0 }]]),
  );
  assert.deepEqual(rows[0], {
    id: 'powershell_optimize',
    description: undefined,
    functions: 26,
    attached: ['PowerShell Events', 'r2'],
    destinations: ['default'],
    stats: { in: 5, out: 4, dropped: 1, err: 0 },
  });
  // The pipeline's own output is not a destination, matching Cribl ("None").
  assert.deepEqual(rows[1].destinations, []);
  assert.deepEqual(rows[2].attached, ['Source: syslog:in', 'Source: http:in']);
  assert.deepEqual(rows[2].destinations, ['s3']);
  assert.equal(rows[2].stats, undefined);
});

test('filterRows matches id, description, routes and destinations', () => {
  const rows = overviewRows([pl('a', 0, { description: 'Windows logs' }), pl('b', 0)], [{ id: 'r', name: 'To Splunk', pipeline: 'b', output: 'splunk' }], [], null);
  assert.deepEqual(filterRows(rows, 'WINDOWS').map((r) => r.id), ['a']);
  assert.deepEqual(filterRows(rows, 'splunk').map((r) => r.id), ['b']);
  assert.equal(filterRows(rows, '  ').length, 2);
});

test('statsById strips the pack prefix and skips other packs', () => {
  const results = [
    { id: 'pk.main', inEvents: 10, outEvents: 9 },
    { id: 'other.main', inEvents: 1 },
    { id: 'main', inEvents: 3, errEvents: 2 },
  ];
  assert.deepEqual([...statsById(results, 'pk')], [['main', { in: 10, out: 9, dropped: 0, err: 0 }]]);
  assert.deepEqual([...statsById(results, null)], [['main', { in: 3, out: 0, dropped: 0, err: 2 }]]);
});

test('compact numbers', () => {
  assert.deepEqual([0, 999, 1000, 1234, 39604, 123456, 2_500_000].map(compact), ['0', '999', '1K', '1.2K', '39.6K', '123K', '2.5M']);
});
