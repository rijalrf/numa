import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRole, isRole, projectWhere, agentProjectWhere } from '../access';
import { requiredRoleForMethod } from '../../middleware/require-project-role';

test('hasRole mengikuti hierarki viewer < member < admin < owner', () => {
  assert.equal(hasRole('owner', 'admin'), true);
  assert.equal(hasRole('admin', 'admin'), true);
  assert.equal(hasRole('member', 'admin'), false);
  assert.equal(hasRole('viewer', 'member'), false);
  assert.equal(hasRole('viewer', 'viewer'), true);
  assert.equal(hasRole(null, 'viewer'), false);
});

test('isRole menolak nilai di luar daftar peran', () => {
  assert.equal(isRole('admin'), true);
  assert.equal(isRole('superuser'), false);
  assert.equal(isRole(undefined), false);
});

test('requiredRoleForMethod: baca viewer, mutasi member, hapus admin', () => {
  assert.equal(requiredRoleForMethod('GET'), 'viewer');
  assert.equal(requiredRoleForMethod('post'), 'member');
  assert.equal(requiredRoleForMethod('PATCH'), 'member');
  assert.equal(requiredRoleForMethod('PUT'), 'member');
  assert.equal(requiredRoleForMethod('DELETE'), 'admin');
});

test('projectWhere mencakup project pribadi dan project org, dengan id opsional', () => {
  const w = projectWhere('u1', 'p1');
  assert.equal(w.id, 'p1');
  assert.deepEqual(w.OR[0], { userId: 'u1' });
  assert.ok('org' in w.OR[1]);
  assert.equal('id' in projectWhere('u1'), false);
});

test('agentProjectWhere tidak memberi akses ke anggota viewer', () => {
  const w = agentProjectWhere('u1', 'p1') as any;
  const roles = w.OR[1].org.members.some.role.in;
  assert.deepEqual(roles, ['member', 'admin', 'owner']);
});
