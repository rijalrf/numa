import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(40),
  BETTER_AUTH_URL: 'https://api.example.com',
  FE_URL: 'https://example.com',
  OPENAI_API_KEY: 'kunci-uji',
};

test('env produksi lengkap tidak menghasilkan error', () => {
  const r = validateEnv({ ...base, NODE_ENV: 'production' } as NodeJS.ProcessEnv);
  assert.deepEqual(r.errors, []);
});

test('DATABASE_URL kosong adalah error', () => {
  const r = validateEnv({ ...base, DATABASE_URL: '' } as NodeJS.ProcessEnv);
  assert.ok(r.errors.some((e) => e.includes('DATABASE_URL')));
});

test('secret lemah di produksi ditolak', () => {
  const r = validateEnv({ ...base, NODE_ENV: 'production', BETTER_AUTH_SECRET: 'changeme' } as NodeJS.ProcessEnv);
  assert.ok(r.errors.some((e) => e.includes('BETTER_AUTH_SECRET')));
});

test('nilai bukan bilangan bulat ditolak', () => {
  const r = validateEnv({ ...base, AI_JOB_CONCURRENCY: 'banyak' } as NodeJS.ProcessEnv);
  assert.ok(r.errors.some((e) => e.includes('AI_JOB_CONCURRENCY')));
});
