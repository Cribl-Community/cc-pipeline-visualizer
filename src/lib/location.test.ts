import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPack, parsePlace, placePath, sameScope } from './location';

const BASE = '/app-ui/cribl-pipeline-visualizer';
const at = (path: string, search = '') => parsePlace(BASE, BASE + path, search);

test('a pack link opens the pack overview', () => {
  assert.deepEqual(at('/groups/seLab/packs/my-pack'), { group: 'seLab', source: 'pack', pack: 'my-pack', pipeline: null });
});

test('a pack pipeline link opens that pipeline', () => {
  assert.deepEqual(at('/groups/seLab/packs/my-pack/pipelines/main'), { group: 'seLab', source: 'pack', pack: 'my-pack', pipeline: 'main' });
});

test('the group’s own pipelines', () => {
  assert.deepEqual(at('/groups/seLab/pipelines'), { group: 'seLab', source: 'group', pack: null, pipeline: null });
  assert.deepEqual(at('/groups/seLab/pipelines/main'), { group: 'seLab', source: 'group', pack: null, pipeline: 'main' });
});

test('no group means the pack picker of the default group', () => {
  assert.deepEqual(at('/'), { group: null, source: 'pack', pack: null, pipeline: null });
  assert.deepEqual(at('/other/thing'), { group: null, source: 'pack', pack: null, pipeline: null });
  assert.deepEqual(at('/groups/seLab'), { group: 'seLab', source: 'pack', pack: null, pipeline: null });
});

test('legacy query links are still read, the path wins', () => {
  assert.deepEqual(at('/', '?group=seLab&pack=my-pack&pipeline=main'), { group: 'seLab', source: 'pack', pack: 'my-pack', pipeline: 'main' });
  assert.equal(at('/', '?group=seLab&pipeline=main').source, 'group');
  assert.equal(at('/', '?group=seLab&source=group').source, 'group');
  assert.equal(at('/groups/g/packs/p', '?group=other').group, 'g');
});

test('standalone dev has no base path', () => {
  assert.equal(parsePlace('', '/groups/g/packs/p', '').pack, 'p');
});

test('placePath round-trips and encodes', () => {
  for (const s of ['/groups/seLab/packs/my-pack', '/groups/seLab/packs/my-pack/pipelines/a%20b', '/groups/seLab/pipelines/main', '/groups/seLab/pipelines', '/groups/seLab']) {
    assert.equal(placePath(at(s)), s);
  }
  assert.equal(placePath({ group: null, source: 'pack', pack: 'x', pipeline: 'y' }), '/');
  // A pipeline needs its pack in pack mode.
  assert.equal(placePath({ group: 'g', source: 'pack', pack: null, pipeline: 'y' }), '/groups/g');
});

test('sameScope ignores the pipeline only', () => {
  const a = at('/groups/g/packs/p/pipelines/one');
  assert.ok(sameScope(a, at('/groups/g/packs/p')));
  assert.ok(!sameScope(a, at('/groups/g/packs/q')));
  assert.ok(!sameScope(a, at('/groups/g/pipelines')));
});

test('findPack accepts the id, the display name, or either in Cribl’s id form', () => {
  const packs = [
    { id: 'ciscoasa-cim', displayName: 'CiscoAsa_CIM' },
    { id: 'ciscoftd-cim', displayName: 'CiscoFtd_CIM' },
    { id: 'Exact_Case', displayName: 'other' },
  ];
  assert.equal(findPack(packs, 'ciscoftd-cim')?.id, 'ciscoftd-cim');
  assert.equal(findPack(packs, 'CiscoFtd_CIM')?.id, 'ciscoftd-cim');
  assert.equal(findPack(packs, 'ciscoftd_cim')?.id, 'ciscoftd-cim');
  assert.equal(findPack(packs, 'CISCOFTD-CIM')?.id, 'ciscoftd-cim');
  assert.equal(findPack(packs, 'exact_case')?.id, 'Exact_Case');
  assert.equal(findPack(packs, 'cisco'), undefined);
});
