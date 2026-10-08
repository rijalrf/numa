// Tes penyimpanan tech stack terhadap database nyata: atomik dan aman terhadap request bersamaan.
// Dilewati otomatis bila database tidak terjangkau atau belum ada user.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { prisma as PrismaClient } from '../prisma.js';

let prisma: typeof PrismaClient;
let ready = false;
let projectId = '';
let saveTechStack: typeof import('../techstack-store.js').saveTechStack;
let enqueueAiJobOnce: typeof import('../ai/job.js').enqueueAiJobOnce;

const stackA = ['frontend:React v18', 'backend:TypeScript + Express', 'database:PostgreSQL + Prisma', 'styling:Tailwind CSS', 'testing:Playwright'];
const stackB = ['frontend:Next.js 14', 'backend:Next.js', 'database:SQLite + Prisma', 'styling:Tailwind CSS', 'testing:Playwright'];

before(async () => {
  try {
    ({ prisma } = await import('../prisma.js'));
    const job = await import('../ai/job.js');
    await job.stopJobWorker(); // jangan klaim job nyata di antrean
    enqueueAiJobOnce = job.enqueueAiJobOnce;
    ({ saveTechStack } = await import('../techstack-store.js'));
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) return;
    const project = await prisma.project.create({
      data: { userId: user.id, name: 'tes-techstack', idea: 'tes', wizardStep: 'techstack' },
    });
    projectId = project.id;
    ready = true;
  } catch (err) {
    ready = false;
    console.warn('Tes tech stack dilewati:', (err as Error).message.split('\n').pop());
  }
});

after(async () => {
  if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
});

test('penyimpanan bersamaan menyisakan satu set stack dan memajukan wizard ke prd', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  await Promise.all([saveTechStack(projectId, stackA), saveTechStack(projectId, stackB), saveTechStack(projectId, stackA), saveTechStack(projectId, stackB)]);
  assert.equal(await prisma.stack.count({ where: { projectId } }), stackA.length);
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).wizardStep, 'prd');
});

test('penyimpanan yang gagal di tengah tidak mengubah stack lama', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  await saveTechStack(projectId, stackA);
  await prisma.project.update({ where: { id: projectId }, data: { wizardStep: 'techstack' } });
  const before = (await prisma.stack.findMany({ where: { projectId }, orderBy: { name: 'asc' } })).map((s) => s.name);

  // Karakter NUL ditolak Postgres saat createMany, setelah deleteMany berjalan di transaksi yang sama.
  await assert.rejects(saveTechStack(projectId, ['frontend:Bad\u0000Name', ...stackB]));

  const after = (await prisma.stack.findMany({ where: { projectId }, orderBy: { name: 'asc' } })).map((s) => s.name);
  assert.deepEqual(after, before);
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).wizardStep, 'techstack');
});

test('enqueue techstack_recommend bersamaan hanya membuat satu job', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const results = await Promise.all(Array.from({ length: 6 }, () => enqueueAiJobOnce({ projectId, type: 'techstack_recommend' })));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(await prisma.aiJob.count({ where: { projectId, type: 'techstack_recommend' } }), 1);
});
