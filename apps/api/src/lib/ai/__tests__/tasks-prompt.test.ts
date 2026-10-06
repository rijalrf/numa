import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTasksPrompt, type GenerateTasksArgs } from '../tasks.js';
import { PROMPT_VERSIONS } from '../prompts.js';

const fr = Array.from({ length: 14 }, (_, i) => ({
  id: `FR-${String(i + 1).padStart(3, '0')}`,
  title: `Fitur ${i + 1}`,
  description: 'Pengguna dapat melakukan aksi tertentu pada sistem dengan validasi lengkap dan pesan kesalahan yang jelas.',
}));
const rules = Array.from({ length: 8 }, (_, i) => ({ id: `PR-00${i + 1}`, description: 'Aturan integritas data dan validasi pada setiap operasi.' }));
const endpoints = Array.from({ length: 20 }, (_, i) => ({ method: 'POST', path: `/api/r${i}`, description: 'Operasi resource', requestBody: '{ a: string }', responseBody: '{ id: string }' }));
const markdown = [...fr.map((r) => `- **${r.id}**: ${r.title}. ${r.description}`), ...rules.map((r) => `- **${r.id}**: ${r.description}`), ...endpoints.map((e) => `${e.method} ${e.path} ${e.description}`)].join('\n');

const prd = {
  markdown,
  requirementIndex: [...fr, ...rules].map((r) => ({ id: r.id, title: 'judul' })),
  functionalRequirements: fr,
  productRules: rules,
  apiEndpoints: endpoints,
};

const base = {
  roadmap: { phases: [] },
  projectName: 'Uji',
  projectId: 'p1',
} as unknown as GenerateTasksArgs;

const size = (p: { system: string; user: string }) => p.system.length + p.user.length;

test('markdown PRD utuh: daftar terstruktur duplikat tidak dikirim, indeks ID tetap ada', () => {
  const { user } = buildTasksPrompt({ ...base, prd });
  assert.ok(user.includes('DAFTAR REQUIREMENT ID TERSEDIA'));
  assert.ok(!user.includes('KEBUTUHAN FUNGSIONAL TERSEDIA'));
  assert.ok(!user.includes('ATURAN PRODUK TERSEDIA'));
  assert.ok(!user.includes('SPESIFIKASI ENDPOINT API TERSEDIA'));
});

test('tanpa markdown: daftar terstruktur dipakai sebagai sumber', () => {
  const { user } = buildTasksPrompt({ ...base, prd: { ...prd, markdown: undefined } });
  assert.ok(user.includes('KEBUTUHAN FUNGSIONAL TERSEDIA'));
  assert.ok(user.includes('SPESIFIKASI ENDPOINT API TERSEDIA'));
});

test('markdown melewati batas potong: daftar terstruktur tetap dikirim sebagai jaring pengaman', () => {
  const { user } = buildTasksPrompt({ ...base, prd: { ...prd, markdown: markdown + 'x'.repeat(16000) } });
  assert.ok(user.includes('KEBUTUHAN FUNGSIONAL TERSEDIA'));
  assert.ok(user.includes('SPESIFIKASI ENDPOINT API TERSEDIA'));
});

test('dedup memangkas ukuran prompt secara berarti dibanding mengirim keduanya', () => {
  const ringkas = size(buildTasksPrompt({ ...base, prd }));
  const ganda = size(buildTasksPrompt({ ...base, prd: { ...prd, markdown: undefined } })) + markdown.length;
  assert.ok(ringkas < ganda * 0.75, `ringkas=${ringkas} ganda=${ganda}`);
});

test('versi prompt tasks tercatat di katalog', () => {
  assert.match(PROMPT_VERSIONS.tasks, /^tasks@\d+$/);
});
