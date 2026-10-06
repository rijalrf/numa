import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGoldenSelection } from '../golden-stack.js';
import { parseStackEntry } from '../stack-contract.js';

test('parseStackEntry memisahkan kategori, nama, dan versi', () => {
  assert.deepEqual(parseStackEntry('backend:Express 4'), { category: 'backend', name: 'Express', version: '4' });
  assert.deepEqual(parseStackEntry('Tailwind CSS'), { category: 'general', name: 'Tailwind CSS', version: null });
});

test('validateGoldenSelection menolak pilihan kosong dan database di luar kontrak', () => {
  assert.equal(validateGoldenSelection([]).ok, false);
  const mongo = validateGoldenSelection(['backend:Express', 'database:MongoDB']);
  assert.equal(mongo.ok, false);
});

test('validateGoldenSelection menerima React + Express + PostgreSQL + Prisma', () => {
  const res = validateGoldenSelection(['frontend:React', 'backend:Express', 'database:PostgreSQL + Prisma']);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.packId, 'react-express');
});

test('validateGoldenSelection menolak ORM terlarang (TypeORM, Drizzle)', () => {
  assert.equal(validateGoldenSelection(['backend:Express', 'database:PostgreSQL + TypeORM']).ok, false);
  assert.equal(validateGoldenSelection(['backend:Express', 'database:PostgreSQL + Drizzle']).ok, false);
});
