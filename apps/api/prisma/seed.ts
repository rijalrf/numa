// Seed data demo: 1 user, 1 project, BRD, roadmap, tasks, dan 1 PAT demo.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const SEED_EMAIL = process.env.SEED_USER_EMAIL ?? 'demo@numa.dev';
const SEED_NAME = process.env.SEED_USER_NAME ?? 'User Demo';
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'password123';
const SEED_CLI_TOKEN = process.env.SEED_CLI_TOKEN ?? 'numa_demo_seed_token_replace_in_app';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    console.error('Seed dibatalkan: Database seeding tidak diizinkan pada lingkungan produksi tanpa ALLOW_PRODUCTION_SEED=true.');
    process.exit(1);
  }

  console.log('Resetting tables...');
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.roadmapDependency.deleteMany();
  await prisma.roadmapFeature.deleteMany();
  await prisma.roadmapPhase.deleteMany();
  await prisma.brd.deleteMany();
  await prisma.discoveryAnswer.deleteMany();
  await prisma.discoveryQuestion.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.agentSession.deleteMany();
  await prisma.agentToken.deleteMany();
  await prisma.stack.deleteMany();
  await prisma.project.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      email: SEED_EMAIL,
      name: SEED_NAME,
      emailVerified: true,
    },
  });

  const passwordHash = await hashPassword(SEED_PASSWORD);

  // Simpan akun kredensial dengan password hash terenkripsi dinamis
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      password: passwordHash,
    },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: 'Aplikasi Catatan Pribadi',
      idea: 'Aplikasi web untuk mencatat ide dan tugas harian dengan tag dan pengingat.',
      description: 'Contoh project demo hasil generate AI.',
      status: 'ACTIVE',
    },
  });

  await prisma.stack.createMany({
    data: [
      { projectId: project.id, category: 'frontend', name: 'React', version: '18' },
      { projectId: project.id, category: 'backend', name: 'Express', version: '4' },
      { projectId: project.id, category: 'database', name: 'PostgreSQL' },
    ],
  });

  await prisma.brd.create({
    data: {
      projectId: project.id,
      content: {
        overview: 'Aplikasi catatan pribadi dengan fitur tag, pengingat, dan pencarian cepat.',
        goals: ['CRUD catatan', 'Pencarian tag', 'Pengingat berbasis waktu'],
        features: [
          { id: 'auth', name: 'Autentikasi User' },
          { id: 'notes', name: 'Manajemen Catatan' },
          { id: 'tags', name: 'Sistem Tag' },
          { id: 'reminders', name: 'Pengingat' },
        ],
        techRequirements: ['React 18', 'Express', 'PostgreSQL', 'Prisma'],
        nonFunctional: ['Responsif', 'Aman', 'Performa cepat'],
        outOfScope: ['Kolaborasi real-time', 'Sinkronisasi cloud'],
      },
    },
  });

  const phaseDb = await prisma.roadmapPhase.create({
    data: { projectId: project.id, order: 1, title: 'Fondasi Database', layer: 'DATABASE' },
  });
  const phaseBe = await prisma.roadmapPhase.create({
    data: { projectId: project.id, order: 2, title: 'Backend API', layer: 'BACKEND' },
  });
  const phaseFe = await prisma.roadmapPhase.create({
    data: { projectId: project.id, order: 3, title: 'Frontend UI', layer: 'FRONTEND' },
  });

  const featSchema = await prisma.roadmapFeature.create({
    data: { phaseId: phaseDb.id, title: 'Skema Prisma', description: 'Model User, Note, Tag' },
  });
  const featAuth = await prisma.roadmapFeature.create({
    data: { phaseId: phaseBe.id, title: 'API Autentikasi', description: 'Register, login, session' },
  });
  const featNotes = await prisma.roadmapFeature.create({
    data: { phaseId: phaseBe.id, title: 'API Catatan', description: 'CRUD catatan' },
  });
  const featUi = await prisma.roadmapFeature.create({
    data: { phaseId: phaseFe.id, title: 'UI Kanban Catatan', description: 'Tampilan daftar catatan' },
  });

  await prisma.roadmapDependency.createMany({
    data: [
      { featureId: featAuth.id, dependsOnId: featSchema.id },
      { featureId: featNotes.id, dependsOnId: featAuth.id },
      { featureId: featUi.id, dependsOnId: featNotes.id },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        projectId: project.id,
        featureId: featSchema.id,
        title: 'Definisikan model Prisma untuk User dan Note',
        layer: 'DATABASE',
        order: 1,
        aiContext: {
          files_to_create: ['apps/api/prisma/schema.prisma'],
          files_to_modify: [],
          forbidden: ['apps/web/**'],
        },
        acceptanceCriteria: ['Model User dan Note tersedia', 'Migration berhasil'],
      },
      {
        projectId: project.id,
        featureId: featAuth.id,
        title: 'Endpoint register dan login',
        layer: 'BACKEND',
        order: 2,
        aiContext: {
          files_to_create: ['apps/api/src/routes/auth.ts'],
          files_to_modify: ['apps/api/src/index.ts'],
          forbidden: ['apps/web/**', 'apps/api/prisma/**'],
        },
        acceptanceCriteria: ['POST /api/auth/register mengembalikan 201', 'POST /api/auth/login mengembalikan 200 + session'],
      },
      {
        projectId: project.id,
        featureId: featNotes.id,
        title: 'Endpoint CRUD catatan',
        layer: 'BACKEND',
        order: 3,
        aiContext: {
          files_to_create: ['apps/api/src/routes/notes.ts'],
          files_to_modify: ['apps/api/src/index.ts'],
          forbidden: ['apps/web/**'],
        },
        acceptanceCriteria: ['GET/POST/PUT/DELETE /api/notes berjalan'],
      },
      {
        projectId: project.id,
        featureId: featUi.id,
        title: 'Halaman daftar catatan',
        layer: 'FRONTEND',
        order: 4,
        aiContext: {
          files_to_create: ['apps/web/src/pages/notes.tsx'],
          files_to_modify: ['apps/web/src/App.tsx'],
          forbidden: ['apps/api/**'],
        },
        acceptanceCriteria: ['Menampilkan daftar catatan dari API'],
      },
    ],
  });

  // Token demo untuk pengujian CLI — Universal PAT dengan multi-project scope.
  const demoToken = SEED_CLI_TOKEN;
  const tokenHash = crypto.createHash('sha256').update(demoToken).digest('hex');
  await prisma.agentToken.create({
    data: {
      userId: user.id,
      name: 'Token Demo (seed)',
      tokenHash,
      agentTokenScopes: {
        create: { projectId: project.id }
      }
    },
  });

  console.log('Seed selesai.');
  console.log('User demo:', user.email);
  console.log('Project:', project.name, '(', project.id, ')');
  console.log('Token demo CLI:', demoToken);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
