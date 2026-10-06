import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStageLocked, furthestStage } from '../stage.js';

test('tahap yang sudah dilewati terkunci, tahap saat ini dan berikutnya terbuka', () => {
  assert.equal(isStageLocked('prd', 'techstack'), true);
  assert.equal(isStageLocked('prd', 'prd'), false);
  assert.equal(isStageLocked('prd', 'tree'), false);
});

test('alias lama setara dengan tahap barunya', () => {
  assert.equal(isStageLocked('brd', 'prd'), false);
  assert.equal(isStageLocked('interview', 'survey'), false);
});

test('furthestStage mengikuti artefak yang ada meski wizardStep mundur', () => {
  const base = { wizardStep: 'chat', prd: null, _count: { stacks: 0, treeNodes: 0, tasks: 0 } };
  assert.equal(furthestStage(base), 'survey');
  assert.equal(furthestStage({ ...base, _count: { stacks: 1, treeNodes: 0, tasks: 0 } }), 'techstack');
  assert.equal(furthestStage({ ...base, prd: { id: 'x' } }), 'prd');
  assert.equal(furthestStage({ ...base, prd: { id: 'x' }, _count: { stacks: 1, treeNodes: 0, tasks: 3 } }), 'board');
});
