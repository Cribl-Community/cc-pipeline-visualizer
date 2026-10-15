import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffFields, pairEvents, pctChange, totals, visibleKeys } from './diff.ts';
import { activeIndexes, previewKey, sliceConf, statsIndex } from './pipeline.ts';
import type { PipelineConf } from './types.ts';
import { ApiError, isMissingPipeline } from './api.ts';

test('visibleKeys hides preview bookkeeping and internal fields, _raw/_time first', () => {
  const ev = { b: 1, _time: 2, __id: 0, __parsed: {}, _raw: 'x', a: 3 };
  assert.deepEqual(visibleKeys(ev, false), ['_raw', '_time', 'a', 'b']);
  assert.deepEqual(visibleKeys(ev, true), ['_raw', '_time', '__parsed', 'a', 'b']);
});

test('diffFields marks added, changed, removed and same', () => {
  const rows = diffFields({ _raw: 'a', keep: 1, gone: 2 }, { _raw: 'b', keep: 1, fresh: 3 }, false);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.status]));
  assert.deepEqual(byKey, { _raw: 'changed', keep: 'same', fresh: 'added', gone: 'removed' });
  assert.equal(rows.at(-1)?.key, 'gone', 'removed fields are appended last');
});

test('diffFields compares objects by value', () => {
  const rows = diffFields({ o: { a: 1 } }, { o: { a: 1 } }, false);
  assert.equal(rows[0].status, 'same');
});

test('pairEvents detects dropped events by missing __id', () => {
  const pairs = pairEvents(
    [{ __id: 0, _raw: 'a' }, { __id: 1, _raw: 'b' }],
    [{ __id: 0, _raw: 'a' }],
  );
  assert.deepEqual(pairs.map((p) => p.status), ['same', 'dropped']);
});

test('pairEvents honours explicit dropped flags', () => {
  const pairs = pairEvents([{ __id: 0, _raw: 'a' }], [{ __id: 0, _raw: 'a', __isDropped: true }]);
  assert.equal(pairs[0].status, 'dropped');
});

test('pairEvents reports clones and unknown ids as new', () => {
  const pairs = pairEvents(
    [{ __id: 0, _raw: 'a' }],
    [{ __id: 0, _raw: 'a' }, { __id: 0, _raw: 'a', clone: true }, { __id: 9, _raw: 'agg' }],
  );
  assert.deepEqual(pairs.map((p) => p.status), ['same', 'new', 'new']);
});

test('pairEvents falls back to position when __id is missing', () => {
  const pairs = pairEvents([{ _raw: 'a' }, { _raw: 'b' }], [{ _raw: 'a' }, { _raw: 'B' }]);
  assert.deepEqual(pairs.map((p) => p.status), ['same', 'changed']);
});

test('pairEvents handles empty inputs', () => {
  assert.deepEqual(pairEvents([], []), []);
  assert.equal(pairEvents([], [{ __id: 1 }])[0].status, 'new');
});

test('totals and pctChange', () => {
  const t = totals([{ _raw: 'abc', x: 1 }, { _raw: 'z', __isDropped: true }]);
  assert.equal(t.events, 1);
  assert.equal(t.fields, 2);
  assert.equal(pctChange(10, 5), -50);
  assert.equal(pctChange(0, 5), 0);
});

const conf: PipelineConf = {
  groups: { g1: { disabled: true } },
  functions: [
    { id: 'comment', conf: { comment: 'hi' } },
    { id: 'eval', filter: 'true', conf: { add: [] } },
    { id: 'drop', disabled: true, conf: {} },
    { id: 'eval', groupId: 'g1', conf: {} },
    { id: 'rename', conf: {} },
  ],
};

test('activeIndexes and statsIndex skip comments, disabled and disabled groups', () => {
  assert.deepEqual(activeIndexes(conf), [1, 4]);
  assert.equal(statsIndex(conf, 4), 1);
  assert.equal(statsIndex(conf, 1), 0);
});

test('previewKey ignores inactive functions so equivalent slices share a cache entry', () => {
  assert.equal(previewKey(sliceConf(conf, 2), 's1'), previewKey(sliceConf(conf, 4), 's1'));
  assert.notEqual(previewKey(sliceConf(conf, 2), 's1'), previewKey(sliceConf(conf, 5), 's1'));
  assert.notEqual(previewKey(sliceConf(conf, 2), 's1'), previewKey(sliceConf(conf, 2), 's2'));
});

test('isMissingPipeline accepts 404 and Cribl\'s 500 "unknown pipeline id"', () => {
  assert.equal(isMissingPipeline(new ApiError('PATCH /m/g/p/x/pipelines/s failed (500): unknown pipeline id=s', 500)), true);
  assert.equal(isMissingPipeline(new ApiError('not found', 404)), true);
  assert.equal(isMissingPipeline(new ApiError('PATCH failed (500): out of memory', 500)), false);
});
