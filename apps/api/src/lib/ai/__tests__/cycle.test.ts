import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ImpactSchema,
  SpecDeltaSchema,
  assignRequirementIds,
  buildCyclePrdContext,
  enforceClarityLimit,
  mapFeatureLabels,
  mergePrdDelta,
  mergeSpecDelta,
  nextFunctionalRequirementNumber,
  remapSpecDeltaIds,
  renderSpecDeltaMarkdown,
  summarizeCompletedTasks,
  type ImpactResult,
} from '../cycle.js';
import { parseRequirementIndex, readPrdContent } from '../prd.js';
import { ProductSpecSchema } from '../product-spec.js';
import { PROMPT_VERSIONS } from '../prompts.js';

const baseMarkdown = [
  '# PRD',
  '## 4. Functional Requirements',
  '- **FR-001**: Pengguna dapat login',
  '- **FR-024**: Pengguna dapat mengekspor laporan',
  '## 5. Aturan Produk',
  '- **PR-001**: Password di-hash',
].join('\n');

const baseSpec = ProductSpecSchema.parse({
  entities: [{ name: 'User', fields: [{ name: 'id', type: 'string' }], relations: [] }],
  endpoints: [{ method: 'post', path: '/api/login', description: 'Login', requirementIds: ['FR-001'] }],
  journeys: [{ name: 'Login', steps: ['Buka halaman login', 'Kirim kredensial'], requirementIds: ['FR-001'] }],
});

const baseContent = {
  markdown: baseMarkdown,
  requirementIndex: parseRequirementIndex(baseMarkdown),
  spec: baseSpec,
};

test('versi prompt siklus dan task sudah dinaikkan', () => {
  assert.equal(PROMPT_VERSIONS.cycle, 'cycle@3');
  assert.equal(PROMPT_VERSIONS.tasks, 'tasks@6');
});

test('nextFunctionalRequirementNumber melanjutkan dari FR terbesar', () => {
  assert.equal(nextFunctionalRequirementNumber(readPrdContent(baseContent)), 25);
  assert.equal(nextFunctionalRequirementNumber({ markdown: '', requirementIndex: [] }), 1);
  assert.equal(nextFunctionalRequirementNumber({ markdown: 'tanpa id', requirementIndex: [{ id: 'FR-120', title: 'x' }] }), 121);
});

test('assignRequirementIds menomori berurutan dan memetakan penanda sementara', () => {
  const reqs = [
    { id: 'NEW-1', title: 'A', description: 'a', priority: 'HIGH' as const },
    { id: 'NEW-2', title: 'B', description: 'b', priority: 'LOW' as const },
  ];
  const { requirements, idMap } = assignRequirementIds(reqs, 25);
  assert.deepEqual(requirements.map((r) => r.id), ['FR-025', 'FR-026']);
  assert.equal(idMap.get('NEW-1'), 'FR-025');
  assert.equal(idMap.get('NEW-2'), 'FR-026');
});

test('assignRequirementIds tidak memetakan penanda yang sama dengan ID lama', () => {
  const reqs = [{ id: 'FR-001', title: 'A', description: '', priority: 'MEDIUM' as const }];
  const { requirements, idMap } = assignRequirementIds(reqs, 25, ['FR-001']);
  assert.equal(requirements[0].id, 'FR-025');
  assert.equal(idMap.has('FR-001'), false);
});

test('mergePrdDelta: requirement baru terbaca ulang dari markdown dan masuk indeks', () => {
  const { requirements, idMap } = assignRequirementIds(
    [{ id: 'NEW-1', title: 'Ekspor ke CSV', description: 'Unduh transaksi', priority: 'HIGH' }],
    25
  );
  const merged = mergePrdDelta(baseContent, { summary: 'Tambah ekspor', newRequirements: requirements, idMap, cycleNumber: 2 });
  const markdown = merged.markdown as string;
  assert.match(markdown, /## Perubahan Siklus #2: Tambah ekspor/);
  assert.ok(parseRequirementIndex(markdown).some((r) => r.id === 'FR-025'));
  const index = merged.requirementIndex as Array<{ id: string }>;
  assert.deepEqual(index.map((r) => r.id), ['FR-001', 'FR-024', 'PR-001', 'FR-025']);
  assert.equal(readPrdContent(merged).requirementIndex.length, 4);
});

test('mergePrdDelta: deskripsi kosong tidak meninggalkan titik dua kosong', () => {
  const merged = mergePrdDelta(baseContent, {
    summary: 'x',
    newRequirements: [
      { id: 'FR-025', title: 'Validasi email pada formulir kontak', description: '', priority: 'MEDIUM' },
      { id: 'FR-026', title: 'Ekspor CSV', description: 'Unduh log', priority: 'HIGH' },
    ],
  });
  const markdown = merged.markdown as string;
  assert.match(markdown, /- \*\*FR-025\*\*: Validasi email pada formulir kontak \(Prioritas: MEDIUM\)/);
  assert.match(markdown, /- \*\*FR-026\*\*: Ekspor CSV: Unduh log \(Prioritas: HIGH\)/);
  assert.doesNotMatch(markdown, /:\s+\(Prioritas/);
});

test('mergePrdDelta: specDelta digabung ke spec, id sementara diganti, dan ditulis ke markdown', () => {
  const specDelta = SpecDeltaSchema.parse({
    entities: [
      { name: 'user', fields: [{ name: 'id', type: 'string' }, { name: 'email', type: 'string' }] },
      { name: 'Export', fields: [{ name: 'id', type: 'string' }], relations: ['User (many-to-one)'] },
    ],
    endpoints: [{ method: 'get', path: '/api/export', description: 'Unduh CSV', requirementIds: ['NEW-1', 'FR-001'] }],
    journeys: [{ name: 'Ekspor', steps: ['Buka laporan', 'Klik ekspor'], requirementIds: ['NEW-1'] }],
  });
  const { requirements, idMap } = assignRequirementIds(
    [{ id: 'NEW-1', title: 'Ekspor', description: 'CSV', priority: 'MEDIUM' }],
    25
  );
  const merged = mergePrdDelta(baseContent, { summary: 'Ekspor', newRequirements: requirements, specDelta, idMap });
  const doc = readPrdContent(merged);

  assert.equal(doc.spec?.entities.length, 2);
  assert.deepEqual(doc.spec?.entities[0].fields.map((f) => f.name), ['id', 'email']);
  const exportEp = doc.spec?.endpoints.find((e) => e.path === '/api/export');
  assert.deepEqual(exportEp?.requirementIds, ['FR-025', 'FR-001']);
  assert.ok(doc.spec?.journeys.some((j) => j.name === 'Ekspor'));
  assert.deepEqual(doc.spec?.journeys.find((j) => j.name === 'Ekspor')?.requirementIds, ['FR-025']);

  assert.match(doc.markdown, /Perubahan Model Data:/);
  assert.match(doc.markdown, /`GET \/api\/export`/);
  assert.match(doc.markdown, /Journey Tambahan:/);
  assert.doesNotMatch(doc.markdown, /NEW-1/);
});

test('mergePrdDelta: PRD tanpa spec tidak mendapat spec parsial dari delta', () => {
  const content = { markdown: baseMarkdown, requirementIndex: parseRequirementIndex(baseMarkdown) };
  const specDelta = SpecDeltaSchema.parse({ entities: [{ name: 'Export', fields: [] }] });
  const merged = mergePrdDelta(content, {
    summary: 'x',
    newRequirements: [{ id: 'FR-025', title: 'A', description: '' }],
    specDelta,
  });
  assert.equal('spec' in merged, false);
  assert.match(merged.markdown as string, /Perubahan Model Data:/);
});

test('mergeSpecDelta: endpoint sama diganti, journey bernama sama dilewati, jalur gagal tanpa cabang dibuang', () => {
  const delta = SpecDeltaSchema.parse({
    endpoints: [{ method: 'POST', path: '/api/login', description: 'Login baru', requirementIds: ['FR-030'] }],
    journeys: [
      { name: 'login', steps: ['dilewati'] },
      { name: 'Gagal login', steps: ['Tampilkan error'], kind: 'failure', branchFrom: { journey: 'Login', stepIndex: 2 } },
      { name: 'Yatim', steps: ['x'], kind: 'failure', branchFrom: { journey: 'Tidak ada', stepIndex: 1 } },
    ],
  });
  const merged = mergeSpecDelta(baseSpec, delta);
  assert.equal(merged.endpoints.length, 1);
  assert.equal(merged.endpoints[0].description, 'Login baru');
  assert.deepEqual(merged.endpoints[0].requirementIds, ['FR-001', 'FR-030']);
  assert.deepEqual(merged.journeys.map((j) => j.name), ['Login', 'Gagal login']);
});

test('ImpactSchema: specDelta tidak valid dibuang tanpa menggagalkan analisis', () => {
  const out = ImpactSchema.parse({
    summary: 'ok',
    specDelta: { entities: 'bukan array', endpoints: [{ method: '' }] },
    impactedFeatureIds: ['F1', 7, 'F2'],
  });
  assert.equal(out.specDelta, undefined);
  assert.deepEqual(out.impactedFeatureIds, ['F1', 'F2']);
});

test('ImpactSchema: penanda requirement bawaan adalah NEW-n, bukan FR-CYCLE', () => {
  const out = ImpactSchema.parse({ newRequirements: [{ title: 'A' }] });
  assert.equal(out.newRequirements[0].id, 'NEW-1');
});

test('mapFeatureLabels memetakan label ke ID, membuang yang tidak dikenal dan duplikat', () => {
  const features = [
    { id: 'cuid-a', title: 'Login', phase: 'Backend' },
    { id: 'cuid-b', title: 'Laporan', phase: 'Frontend' },
  ];
  assert.deepEqual(mapFeatureLabels(['F2', 'f1', 'F2', 'F9', 'cuid-b', 'asal'], features), ['cuid-b', 'cuid-a']);
  assert.deepEqual(mapFeatureLabels([], features), []);
});

test('enforceClarityLimit memaksa CLEAR hanya saat klarifikasi tidak diizinkan', () => {
  const vague = ImpactSchema.parse({
    clarity: 'VAGUE',
    clarificationQuestions: [
      { id: 'q1', label: 'Apa?', options: ['a', 'b'], suggestion: 'a', suggestionReason: 'x' },
    ],
  }) as ImpactResult;
  assert.equal(enforceClarityLimit(vague, true).clarity, 'VAGUE');
  const forced = enforceClarityLimit(vague, false);
  assert.equal(forced.clarity, 'CLEAR');
  assert.equal(forced.clarificationQuestions, null);
});

test('enforceClarityLimit: VAGUE tanpa pertanyaan dipaksa CLEAR walau klarifikasi diizinkan', () => {
  const vagueNoQuestions = ImpactSchema.parse({ clarity: 'VAGUE' }) as ImpactResult;
  assert.equal(enforceClarityLimit(vagueNoQuestions, true).clarity, 'CLEAR');
});

test('summarizeCompletedTasks membatasi jumlah, berkas, dan mempertahankan task terbaru', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => ({
    title: `T${i}`,
    layer: 'BACKEND',
    aiContext: { files_to_create: [`a${i}.ts`, 'dup.ts'], files_to_modify: ['dup.ts', 7] },
  }));
  const out = summarizeCompletedTasks(tasks, 3);
  assert.deepEqual(out.map((t) => t.title), ['T2', 'T3', 'T4']);
  assert.deepEqual(out[0].files, ['a2.ts', 'dup.ts']);
  assert.deepEqual(summarizeCompletedTasks([{ title: 'X', layer: 'FRONTEND', aiContext: null }]), [{ title: 'X', layer: 'FRONTEND', files: [] }]);
});

test('buildCyclePrdContext memakai ringkasan spec, dan markdown hanya bila spec tidak ada', () => {
  const withSpec = buildCyclePrdContext(readPrdContent(baseContent)) as Record<string, unknown>;
  assert.deepEqual(withSpec.endpoints, ['POST /api/login']);
  assert.deepEqual(withSpec.journeys, ['Login']);
  assert.equal('markdown' in withSpec, false);

  const noSpec = buildCyclePrdContext({ markdown: 'x'.repeat(20000), requirementIndex: [] }) as { markdown: string };
  assert.equal(noSpec.markdown.length, 8000);
  assert.equal(buildCyclePrdContext(null), null);
});

test('mergeSpecDelta: halaman baru digabung ke peta halaman tanpa path ganda dan requirementIds ikut dipetakan', () => {
  const specWithPages = ProductSpecSchema.parse({ pages: [{ path: '/login', access: 'public' }] });
  const delta = SpecDeltaSchema.parse({
    pages: [{ path: '/LOGIN/' }, { path: '/admin/reports', access: 'auth', roles: ['Admin'], requirementIds: ['NEW-1'] }],
  });
  const merged = mergeSpecDelta(specWithPages, delta);
  assert.deepEqual(merged.pages.map((p) => p.path), ['/login', '/admin/reports']);
  assert.deepEqual(remapSpecDeltaIds(delta, new Map([['NEW-1', 'FR-031']])).pages[1].requirementIds, ['FR-031']);
  assert.match(renderSpecDeltaMarkdown(delta).join('\n'), /Halaman Tambahan:/);
});
