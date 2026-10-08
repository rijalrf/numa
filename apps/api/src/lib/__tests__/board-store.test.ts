// Tes penyimpanan roadmap dan laporan validasi terhadap database nyata. Dilewati otomatis bila DB tidak terjangkau.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { prisma as PrismaClient } from '../prisma.js';

let prisma: typeof PrismaClient;
let ready = false;
let projectId = '';
let saveRoadmap: typeof import('../roadmap-store.js').saveRoadmap;
let appendFindings: typeof import('../ai/validation-report.js').appendFindings;
let saveValidationReport: typeof import('../ai/validation-report.js').saveValidationReport;
let enqueueAiJobOnce: typeof import('../ai/job.js').enqueueAiJobOnce;

const roadmap = (suffix = '') => ({
  phases: [
    { order: 1, title: `Fondasi${suffix}`, layer: 'BOOTSTRAP' as const, features: [{ id: 'boot', title: 'Init', dependsOn: [] as string[] }] },
    {
      order: 2,
      title: `API${suffix}`,
      layer: 'BACKEND' as const,
      features: [
        { id: 'api-a', title: 'Produk', dependsOn: ['boot', 'boot', 'tidak-ada'] },
        { id: 'api-b', title: 'Order', dependsOn: ['api-a'] },
      ],
    },
  ],
});

before(async () => {
  try {
    ({ prisma } = await import('../prisma.js'));
    const job = await import('../ai/job.js');
    await job.stopJobWorker(); // jangan klaim job nyata di antrean
    enqueueAiJobOnce = job.enqueueAiJobOnce;
    ({ saveRoadmap } = await import('../roadmap-store.js'));
    ({ appendFindings, saveValidationReport } = await import('../ai/validation-report.js'));
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) return;
    projectId = (await prisma.project.create({ data: { userId: user.id, name: 'tes-board-store', idea: 'tes', wizardStep: 'board' } })).id;
    ready = true;
  } catch (err) {
    ready = false;
    console.warn('Tes penyimpanan board dilewati:', (err as Error).message.split('\n').pop());
  }
});

after(async () => {
  if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
});

test('saveRoadmap menyimpan fase, fitur, dan dependensi (duplikat dan tak dikenal dibuang)', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const ids = await saveRoadmap(projectId, roadmap());
  assert.equal(ids.size, 3);
  assert.equal(await prisma.roadmapPhase.count({ where: { projectId } }), 2);
  const deps = await prisma.roadmapDependency.findMany({ where: { feature: { phase: { projectId } } } });
  assert.equal(deps.length, 2); // api-a -> boot (sekali), api-b -> api-a
});

test('saveRoadmap yang gagal di tengah tidak mengubah roadmap lama', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  // Karakter NUL ditolak Postgres pada penulisan teks, setelah roadmap lama dihapus di transaksi yang sama.
  await assert.rejects(saveRoadmap(projectId, roadmap('\u0000')));
  const phases = await prisma.roadmapPhase.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
  assert.deepEqual(phases.map((p) => p.title), ['Fondasi', 'API']);
  assert.equal(await prisma.roadmapFeature.count({ where: { phase: { projectId } } }), 3);
});

test('appendFindings menambah temuan dan memperbarui ringkasan laporan', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const report = await saveValidationReport(projectId, 'tasks_generate', [{ code: 'A', severity: 'info', message: 'a' }]);
  assert.equal(
    await appendFindings(report.id, [
      { code: 'SEC_IDOR', severity: 'error', message: 'b' },
      { code: 'SEC_X', severity: 'warning', message: 'c' },
    ]),
    true,
  );
  const stored = await prisma.validationReport.findUniqueOrThrow({ where: { id: report.id } });
  assert.equal((stored.findings as unknown[]).length, 3);
  assert.deepEqual(stored.summary, { errors: 1, warnings: 1, infos: 1 });
  assert.equal(await appendFindings('tidak-ada', []), false);
});

test('enqueue tasks_generate dan security_audit bersamaan masing-masing hanya membuat satu job', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  for (const type of ['tasks_generate', 'security_audit'] as const) {
    const results = await Promise.all(Array.from({ length: 6 }, () => enqueueAiJobOnce({ projectId, type })));
    assert.equal(results.filter((r) => r.created).length, 1, type);
    assert.equal(await prisma.aiJob.count({ where: { projectId, type } }), 1, type);
  }
});
