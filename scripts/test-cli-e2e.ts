import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, '../packages/cli/dist/index.js');
const CONFIG_FILE = path.join(os.homedir(), '.numa', 'config.json');
const API_URL = process.env.NUMA_API_URL || 'http://localhost:6655';

function runCli(args: string[], expectFail = false): string {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, NUMA_API_URL: API_URL },
    });
    if (expectFail) {
      assert.fail(`Perintah "numa ${args.join(' ')}" seharusnya gagal tapi berhasil: ${stdout}`);
    }
    return stdout;
  } catch (err: any) {
    if (expectFail) {
      return (err.stdout || '') + (err.stderr || '');
    }
    throw new Error(`Perintah "numa ${args.join(' ')}" gagal:\n${err.stderr || err.stdout || err.message}`);
  }
}

async function testCliE2E() {
  console.log('=== TEST E2E NUMA CLI (v0.3.1) ===\n');

  // Bersihkan config sebelum mulai
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }

  // 1. Test status awal tanpa token
  console.log('1. Uji status awal tanpa token...');
  const initialStatus = runCli(['status']);
  assert(initialStatus.includes('OK'), 'Status server harus OK');
  assert(initialStatus.includes('kosong'), 'Status token harus kosong');
  console.log('   Status awal OK');

  // 2. Uji proteksi perintah tanpa login
  console.log('2. Uji error handling saat belum login...');
  const whoamiNoAuth = runCli(['whoami'], true);
  assert(whoamiNoAuth.includes('Belum login'), 'whoami tanpa login harus ditolak');
  const nextNoAuth = runCli(['next'], true);
  assert(nextNoAuth.includes('Belum login'), 'next tanpa login harus ditolak');
  const prdNoAuth = runCli(['prd'], true);
  assert(prdNoAuth.includes('Belum login'), 'prd tanpa login harus ditolak');
  console.log('   Proteksi tanpa login OK');

  // 3. Persiapkan data pengujian di database
  console.log('3. Menyiapkan token PAT di database...');
  const prisma = new PrismaClient();
  try {
    let project = await prisma.project.findFirst({
      where: { wizardStep: 'board', tasks: { some: {} }, prd: { isNot: null } },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    assert(project, 'Project dengan task dan PRD harus ada di database');

    const testTokenPlain = `numa_e2e_cli_${Date.now()}`;
    const tokenHash = crypto.createHash('sha256').update(testTokenPlain).digest('hex');

    await prisma.agentToken.create({
      data: {
        userId: project.userId,
        name: 'Automated CLI E2E Token',
        tokenHash,
        agentTokenScopes: {
          create: { projectId: project.id },
        },
      },
    });

    console.log(`   Token dibuat untuk project: ${project.name} (${project.id})`);

    // 4. Uji login dengan PAT token
    console.log('4. Uji "numa login <token>"...');
    const loginOut = runCli(['login', testTokenPlain, '--api-url', API_URL]);
    assert(loginOut.includes('Login berhasil!'), 'Login harus berhasil');
    assert(loginOut.includes(project.name), 'Nama project harus terdaftar');
    console.log('   Login berhasil OK');

    // 5. Uji whoami
    console.log('5. Uji "numa whoami"...');
    const whoamiOut = runCli(['whoami']);
    const whoamiJson = JSON.parse(whoamiOut);
    assert.strictEqual(whoamiJson.project.id, project.id, 'Project ID harus sesuai');
    assert.strictEqual(whoamiJson.project.name, project.name, 'Nama project harus sesuai');
    console.log('   whoami output JSON valid');

    // 6. Uji switch tanpa argumen (daftar project)
    console.log('6. Uji "numa switch" tanpa argumen...');
    const switchListOut = runCli(['switch']);
    assert(switchListOut.includes(project.id), 'Daftar scope harus memuat project id');
    assert(switchListOut.includes('*(aktif)') || switchListOut.includes('* (aktif)'), 'Project aktif harus bertanda');
    console.log('   Daftar project switch OK');

    // 7. Uji penanganan projectId kosong (ensureActiveProject)
    console.log('7. Uji pesan ramah saat projectId kosong...');
    const cfgRaw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    delete cfgRaw.projectId;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfgRaw, null, 2));

    const missingProjectOut = runCli(['whoami'], true);
    assert(missingProjectOut.includes('Project aktif belum dipilih'), 'Harus menampilkan pesan ramah');
    assert(missingProjectOut.includes('numa switch <project-id>'), 'Harus menyertakan panduan switch');
    console.log('   Handling projectId kosong ramah OK');

    // 8. Uji switch dengan projectId
    console.log('8. Uji "numa switch <project-id>"...');
    const switchTargetOut = runCli(['switch', project.id]);
    assert(switchTargetOut.includes('Switch berhasil!'), 'Switch harus berhasil');
    assert(switchTargetOut.includes(project.id), 'ProjectId harus terkonfirmasi');
    console.log('   Switch projectId OK');

    // 9. Uji prd (output markdown terstruktur)
    console.log('9. Uji "numa prd"...');
    const prdOut = runCli(['prd']);
    assert(prdOut.includes('# Product Requirements Document') || prdOut.includes('# Product Requirements'), 'Output PRD harus markdown ber-heading');
    assert(prdOut.length > 200, 'Output PRD harus berisi dokumen lengkap');
    console.log(`   PRD Markdown valid (${prdOut.length} karakter)`);

    // 10. Uji next task
    console.log('10. Uji "numa next"...');
    const nextOut = runCli(['next']);
    assert(nextOut.includes('Task #') || nextOut.includes('Tidak ada task tersisa'), 'Output next harus valid');
    console.log('   next task OK');

    // 11. Uji context
    console.log('11. Uji "numa context"...');
    const contextOut = runCli(['context']);
    assert(contextOut.includes('### [TASK') || contextOut.includes('Lingkup Teknis'), 'Context markdown harus valid');
    console.log('   context task OK');

    // 12. Uji start task
    console.log('12. Uji "numa start"...');
    const startOut = runCli(['start']);
    assert(startOut.includes('IN_PROGRESS'), 'Status start harus IN_PROGRESS');
    console.log('   start task OK');

    // 13. Uji done task
    console.log('13. Uji "numa done --force"...');
    const doneOut = runCli(['done', '--force', '--summary', 'Task selesai diverifikasi via E2E test']);
    assert(doneOut.includes('DONE'), 'Status done harus DONE');
    console.log('   done task OK');

    // 14. Uji logout
    console.log('14. Uji "numa logout"...');
    const logoutOut = runCli(['logout']);
    assert(logoutOut.includes('Token dihapus'), 'Logout harus menghapus token');
    const finalStatus = runCli(['status']);
    assert(finalStatus.includes('kosong'), 'Status token harus kembali kosong');
    console.log('   logout OK');

    console.log('\n=== SEMUA TEST E2E NUMA CLI BERHASIL 100%! ===');
  } finally {
    await prisma.$disconnect();
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  }
}

testCliE2E().catch((err) => {
  console.error('\nTEST E2E CLI GAGAL:', err);
  process.exit(1);
});
