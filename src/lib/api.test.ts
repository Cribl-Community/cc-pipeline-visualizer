import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SCRATCH_ID, SCRATCH_MAX_AGE_MS, SCRATCH_PIPELINE_ID, isScratchPipeline, isValidPipelineId, newScratchId, staleScratchIds } from './api';

// One scratch pipeline per tab, swept once abandoned. A single shared name let two tabs or users
// overwrite each other's scratch between the write and the preview, and show the wrong results.

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);

test('every tab gets its own scratch id, hidden from the pipeline list', () => {
  const a = newScratchId(NOW, () => 0.1);
  const b = newScratchId(NOW, () => 0.9);
  assert.notEqual(a, b);
  assert.ok(isScratchPipeline(a) && isScratchPipeline(SCRATCH_PIPELINE_ID) && isScratchPipeline(LEGACY_SCRATCH_ID));
  assert.ok(!isScratchPipeline('main') && !isScratchPipeline('ppc_main'));
  assert.match(a, /^ppc_scratch_[0-9a-z]+_[0-9a-z]{4}$/);
});

test('only abandoned scratch pipelines are swept: the old fixed name, or older than a day', () => {
  const fresh = newScratchId(NOW - 60_000);
  const old = newScratchId(NOW - SCRATCH_MAX_AGE_MS - 60_000);
  const own = newScratchId(NOW - SCRATCH_MAX_AGE_MS * 3);
  const swept = staleScratchIds(['main', fresh, old, own, LEGACY_SCRATCH_ID], NOW, own);
  assert.deepEqual(swept.sort(), [LEGACY_SCRATCH_ID, old].sort());
});

test('a pipeline id from a link must be one path segment', () => {
  assert.ok(isValidPipelineId('main'));
  assert.ok(isValidPipelineId('pack:cisco'));
  for (const bad of ['', '.', '..', 'a/b', 'a\\b']) assert.equal(isValidPipelineId(bad), false, bad);
});
