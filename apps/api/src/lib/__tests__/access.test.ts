import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectWhere } from '../access';

test('projectWhere hanya mencakup project milik user, dengan id opsional', () => {
  assert.deepEqual(projectWhere('u1', 'p1'), { id: 'p1', userId: 'u1' });
  assert.deepEqual(projectWhere('u1'), { userId: 'u1' });
  assert.equal('id' in projectWhere('u1'), false);
});
