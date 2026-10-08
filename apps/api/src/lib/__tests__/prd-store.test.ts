// Tes penyimpanan PRD terhadap database nyata: simpan atomik, spec hanya untuk versi yang diekstrak,
// job ganda tercegah, dan pembuatan task menunggu job spec. Dilewati otomatis bila DB tidak terjangkau.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { prisma as PrismaClient } from '../prisma.js';

let prisma: typeof PrismaClient;
let ready = false;
let projectId = '';
let userId = '';
let savePrd: typeof import('../prd-store.js').savePrd;
let applyProductSpec: typeof import('../prd-store.js').applyProductSpec;
let ensureProductSpec: typeof import('../prd-spec.js').ensureProductSpec;
let enqueueAiJobOnce: typeof import('../ai/job.js').enqueueAiJobOnce;

const spec = { personas: [], entities: [], endpoints: [], rules: [], journeys: [] };

before(async () => {
  try {
    ({ prisma } = await import('../prisma.js'));
    const job = await import('../ai/job.js');
    await job.stopJobWorker(); // jangan klaim job nyata di antrean
    enqueueAiJobOnce = job.enqueueAiJobOnce;
    ({ savePrd, applyProductSpec } = await import('../prd-store.js'));
    ({ ensureProductSpec } = await import('../prd-spec.js'));
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) return;
    userId = user.id;
    const project = await prisma.project.create({ data: { userId, name: 'tes-prd-store', idea: 'tes', wizardStep: 'prd' } });
    projectId = project.id;
    ready = true;
  } catch (err) {
    ready = false;
    console.warn('Tes penyimpanan PRD dilewati:', (err as Error).message.split('\n').pop());
  }
});

after(async () => {
  if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
});

test('savePrd membuat PRD dan memajukan wizard ke board, simpan ulang menaikkan versi', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  assert.equal((await savePrd(projectId, { markdown: '# PRD v1', requirementIndex: [] })).version, 1);
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).wizardStep, 'board');
  assert.equal((await savePrd(projectId, { markdown: '# PRD v2', requirementIndex: [] })).version, 2);
  // Snapshot hanya dibuat saat menimpa PRD yang sudah ada (simpan pertama tanpa snapshot).
  assert.equal(await prisma.artifactVersion.count({ where: { projectId, kind: 'prd' } }), 1);
});

test('savePrd yang gagal tidak mengubah PRD maupun wizardStep', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  await prisma.project.update({ where: { id: projectId }, data: { wizardStep: 'prd' } });
  const before = await prisma.prd.findUniqueOrThrow({ where: { projectId } });

  // jsonb menolak karakter NUL: upsert gagal di dalam transaksi.
  await assert.rejects(savePrd(projectId, { markdown: 'rusak\u0000', requirementIndex: [] }));

  const after = await prisma.prd.findUniqueOrThrow({ where: { projectId } });
  assert.equal(after.version, before.version);
  assert.deepEqual(after.content, before.content);
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).wizardStep, 'prd');
});

test('applyProductSpec hanya menempel pada versi PRD yang diekstrak', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const current = await prisma.prd.findUniqueOrThrow({ where: { projectId } });
  assert.equal(await applyProductSpec(projectId, current.version - 1, spec), false);
  assert.equal('spec' in ((await prisma.prd.findUniqueOrThrow({ where: { projectId } })).content as object), false);

  assert.equal(await applyProductSpec(projectId, current.version, spec), true);
  const stored = (await prisma.prd.findUniqueOrThrow({ where: { projectId } })).content as { spec?: unknown; markdown: string };
  assert.ok(stored.spec);
  assert.equal(stored.markdown, '# PRD v2');
});

test('enqueue prd_generate dan prd_spec bersamaan masing-masing hanya membuat satu job', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  for (const type of ['prd_generate', 'prd_spec'] as const) {
    const results = await Promise.all(Array.from({ length: 6 }, () => enqueueAiJobOnce({ projectId, type, userId })));
    assert.equal(results.filter((r) => r.created).length, 1, type);
    assert.equal(await prisma.aiJob.count({ where: { projectId, type } }), 1, type);
  }
});

test('ensureProductSpec menunggu job prd_spec yang sedang berjalan', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  // PRD tanpa spec + job prd_spec aktif (dari tes sebelumnya). Job selesai dan spec menempel setelah jeda.
  await savePrd(projectId, { markdown: '# PRD v3', requirementIndex: [] });
  const version = (await prisma.prd.findUniqueOrThrow({ where: { projectId } })).version;
  assert.equal(await prisma.aiJob.count({ where: { projectId, type: 'prd_spec', status: { in: ['queued', 'running'] } } }), 1);

  const finishLater = new Promise<void>((resolve) =>
    setTimeout(async () => {
      await applyProductSpec(projectId, version, spec);
      await prisma.aiJob.updateMany({ where: { projectId, type: 'prd_spec' }, data: { status: 'done' } });
      resolve();
    }, 400),
  );
  const started = Date.now();
  const result = await ensureProductSpec(projectId);
  await finishLater;

  assert.ok(Date.now() - started >= 350, 'harus menunggu job selesai');
  assert.equal(result?.extracted, false, 'tidak mengekstrak sendiri karena job menyelesaikan spec');
  assert.ok(result?.prd.spec);
});
