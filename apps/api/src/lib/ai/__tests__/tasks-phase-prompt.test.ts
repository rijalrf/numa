import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTasksPrompt, type GenerateTasksArgs, type PhaseScope } from '../tasks.js';

/** Seluruh teks prompt: aturan layer tersebar di pesan system dan user. */
const promptText = (args: GenerateTasksArgs) => {
  const { system, user } = buildTasksPrompt(args);
  return `${system}\n${user}`;
};

const feature = { id: 'f1', title: 'Fitur', dependsOn: [] as string[] };
const base = (layer: PhaseScope['layer'], phase?: boolean) =>
  ({
    roadmap: { phases: [{ order: 2, title: 'Fase uji', layer, features: [feature] }] },
    projectName: 'Uji',
    projectId: 'p1',
    ...(phase ? { phase: { order: 2, title: 'Fase uji', layer, prefix: 'P2', otherPhases: '- Fase 1 [BOOTSTRAP] Fondasi: Init (featureId: f0)' } } : {}),
  }) as unknown as GenerateTasksArgs;

test('mode fase: lingkup, awalan taskId, dan ringkasan fase lain masuk prompt', () => {
  const { system, user } = buildTasksPrompt(base('BACKEND', true));
  assert.match(system, /LINGKUP FASE INI/);
  assert.match(system, /awalan P2-/);
  assert.match(user, /RINGKASAN FASE LAIN/);
  assert.match(user, /featureId: f0/);
  assert.match(user, /"taskId": "P2-001"/);
});

test('mode fase: aturan layer lain tidak ikut (BACKEND tanpa aturan FRONTEND/INTEGRATION/BOOTSTRAP)', () => {
  const text = promptText(base('BACKEND', true));
  assert.match(text, /ATURAN WAJIB LAYER BACKEND/);
  assert.doesNotMatch(text, /Aturan khusus FRONTEND/);
  assert.doesNotMatch(text, /Wajib pada layer INTEGRATION/);
  assert.doesNotMatch(text, /WAJIB ada task BOOTSTRAP di awal/);
});

test('mode fase: FRONTEND membawa aturan FRONTEND tanpa aturan BACKEND', () => {
  const text = promptText(base('FRONTEND', true));
  assert.match(text, /Aturan khusus FRONTEND/);
  assert.doesNotMatch(text, /ATURAN WAJIB LAYER BACKEND/);
});

test('mode fase: BOOTSTRAP dan INTEGRATION membawa aturan khususnya', () => {
  assert.match(promptText(base('BOOTSTRAP', true)), /WAJIB ada task BOOTSTRAP di awal/);
  const integ = promptText(base('INTEGRATION', true));
  assert.match(integ, /Wajib pada layer INTEGRATION/);
  assert.match(integ, /WAJIB ada WIRING tasks/);
});

test('mode fase lebih kecil dari mode penuh; mode penuh (cycle) tetap memuat semua aturan', () => {
  const full = promptText(base('BACKEND'));
  assert.match(full, /Aturan khusus FRONTEND/);
  assert.match(full, /ATURAN WAJIB LAYER BACKEND/);
  assert.match(full, /Wajib pada layer INTEGRATION/);
  assert.match(full, /TASK-001, TASK-002/);
  assert.ok(promptText(base('BACKEND', true)).length < full.length);
});

test('kontrak bersama (kontrak UI shell, peta halaman, arah desain) masuk ke semua fase dengan isi yang sama', async () => {
  const { ProductSpecSchema } = await import('../product-spec.js');
  const { resolveStackContract } = await import('../stack-contract.js');
  const spec = ProductSpecSchema.parse({
    pages: [{ path: '/login', title: 'Masuk', access: 'public' }, { path: '/patient/appointments', title: 'Janji', roles: ['Pasien'], homeFor: ['Pasien'] }],
    design: { tone: 'klinis, tenang', palette: { primary: '#0f766e' }, typography: { heading: 'Poppins', body: 'Inter' } },
  });
  const stack = { ...resolveStackContract([]), frontend: { framework: 'Next.js', version: null } };
  const withContract = (layer: PhaseScope['layer']) => ({ ...base(layer, true), stack, pages: spec.pages, design: spec.design }) as GenerateTasksArgs;

  const shared = (text: string) => ({
    shell: text.match(/KONTRAK UI SHELL DAN FILE BERSAMA[\s\S]*?END DATA: KONTRAK UI SHELL DAN FILE BERSAMA[^>]*>>>/)?.[0],
    pages: text.match(/PETA HALAMAN DAN NAVIGASI[\s\S]*?END DATA: PETA HALAMAN DAN NAVIGASI[^>]*>>>/)?.[0],
    design: text.match(/ARAH DESAIN PRODUK[\s\S]*?END DATA: ARAH DESAIN PRODUK[^>]*>>>/)?.[0],
  });
  const layers: PhaseScope['layer'][] = ['BOOTSTRAP', 'DATABASE', 'BACKEND', 'FRONTEND', 'INTEGRATION'];
  const first = shared(promptText(withContract('BACKEND')));
  assert.ok(first.shell && first.pages && first.design);
  assert.match(first.pages!, /\/patient\/appointments/);
  assert.match(first.design!, /Poppins/);
  for (const layer of layers) assert.deepEqual(shared(promptText(withContract(layer))), first);
});

test('endpoint tambahan halaman hanya masuk ke fase BACKEND', () => {
  const missing = [{ method: 'DELETE', path: '/api/appointments/:id', page: '/patient/appointments' }];
  const args = (layer: PhaseScope['layer']) => ({ ...base(layer, true), pageEndpointsMissing: missing }) as GenerateTasksArgs;
  assert.match(promptText(args('BACKEND')), /ENDPOINT TAMBAHAN YANG DIBUTUHKAN HALAMAN/);
  assert.doesNotMatch(promptText(args('FRONTEND')), /ENDPOINT TAMBAHAN YANG DIBUTUHKAN HALAMAN/);
});

test('aturan FRONTEND: dua layout, Fondasi UI, larangan membuat endpoint, dan kriteria visual', () => {
  const text = promptText(base('FRONTEND', true));
  assert.match(text, /layout publik/);
  assert.match(text, /TANPA sidebar/);
  assert.match(text, /Fondasi UI/);
  assert.match(text, /DILARANG membuat endpoint API/);
  assert.match(text, /KRITERIA VISUAL/);
  assert.doesNotMatch(text, /Default app shell: sidebar menu/);
  assert.doesNotMatch(text, /rekomendasi, non-blocking/);
});
