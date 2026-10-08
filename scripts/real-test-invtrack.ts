import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const API_BASE = process.env.NUMA_API_URL || 'http://localhost:6655';

/** Token CLI lewat alur device code (satu-satunya jalur): start, setujui dengan sesi uji, lalu poll. */
async function issueCliToken(authedFetch: (path: string, opts?: RequestInit) => Promise<Response>): Promise<string> {
  const startRes = await fetch(`${API_BASE}/api/cli-auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientName: 'e2e' }),
  });
  if (startRes.status !== 201) throw new Error(`Mulai login CLI gagal: ${startRes.status} ${await startRes.text()}`);
  const { deviceCode, userCode } = await startRes.json();
  const approveRes = await authedFetch('/api/cli-auth/approve', { method: 'POST', body: JSON.stringify({ code: userCode }) });
  if (!approveRes.ok) throw new Error(`Setujui login CLI gagal: ${approveRes.status} ${await approveRes.text()}`);
  const pollRes = await fetch(`${API_BASE}/api/cli-auth/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
  });
  const pollJson = await pollRes.json();
  if (pollRes.status !== 200 || !pollJson.token) throw new Error(`Ambil token login CLI gagal: ${pollRes.status} ${JSON.stringify(pollJson)}`);
  return pollJson.token as string;
}
const TARGET_DIR = process.env.TARGET_DIR || process.argv[2] || path.resolve(process.cwd(), 'tmp/invtrack');

async function run() {
  console.log('=== 1. REGISTER & LOGIN USER BARU ===');
  const email = `test-invtrack-${Date.now()}@numa.dev`;
  const password = 'PasswordAman123!';

  const regRes = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3455',
    },
    body: JSON.stringify({ name: 'Jerry Inventory Tester', email, password }),
  });
  if (!regRes.ok) throw new Error(`Register gagal: ${await regRes.text()}`);

  const setCookie = regRes.headers.get('set-cookie');
  assert(setCookie, 'Harus mendapatkan cookie session');
  const sessionCookie = setCookie.split(';')[0];
  console.log('User terdaftar:', email);

  const authedFetch = (endpoint: string, opts: RequestInit = {}) =>
    fetch(`${API_BASE}${endpoint}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        ...(opts.headers || {}),
      },
    });

  console.log('\n=== 2. IDE AWAL ===');
  const ideaText =
    'Saya ingin membuat aplikasi InvTrack: Sistem Manajemen Inventaris dan Peminjaman Barang Kantor sederhana. ' +
    'Target pengguna: Kantor perusahaan dengan 2 peran: ADMIN (pengelola gudang) dan EMPLOYEE (karyawan peminjam). ' +
    'Mekanisme Auth: Login lokal via email/password dan sesi token JWT. ' +
    'Entitas Data Utama: ' +
    '1. User: id, name, email, role (ADMIN | EMPLOYEE). ' +
    '2. Asset: id, name, code/sku, category, totalStock, availableStock, location. ' +
    '3. LoanRequest: id, assetId, employeeId, quantity, status (PENDING | APPROVED | REJECTED | RETURNED), notes, requestDate, returnDate. ' +
    'Fitur Inti MVP: ' +
    '1. Admin membuat aset baru via modal dialog CreateAssetModal. ' +
    '2. Admin mengedit data aset via modal EditAssetModal dan menghapus aset via DeleteAssetDialog. ' +
    '3. Karyawan melihat katalog aset yang tersedia dan mengajukan pinjaman via modal RequestLoanModal. ' +
    '4. Admin melihat daftar pengajuan pinjaman, lalu bisa menyetujui (tombol ApproveLoanButton) atau menolak (RejectLoanDialog). ' +
    '5. Karyawan/Admin memproses pengembalian barang via modal ReturnAssetModal.';

  console.log('\n=== 3. FINALIZE CHAT KE TECH STACK (Langsung tanpa interview) ===');
  const finalizeRes = await authedFetch('/api/chat/finalize', {
    method: 'POST',
    body: JSON.stringify({ idea: ideaText }),
  });
  if (!finalizeRes.ok) throw new Error(`Finalisasi gagal: ${await finalizeRes.text()}`);
  const { projectId } = await finalizeRes.json();
  console.log('Project ID hasil finalize:', projectId);

  const projCheck = await authedFetch(`/api/projects/${projectId}`);
  const { project } = await projCheck.json();
  console.log('Nama Project:', project.name);
  console.log('Wizard Step:', project.wizardStep);
  assert.strictEqual(project.wizardStep, 'techstack', 'wizardStep harus langsung techstack!');

  console.log('\n=== 4. SIMPAN TECH STACK ===');
  const stackRecRes = await authedFetch(`/api/projects/${projectId}/techstack/recommend`, { method: 'POST' });
  const stackRecJson = await stackRecRes.json();
  console.log('Stack rekomendasi:', stackRecJson.techStack);

  const saveStackRes = await authedFetch(`/api/projects/${projectId}/techstack`, {
    method: 'PUT',
    body: JSON.stringify({
      techStack: stackRecJson.techStack || [
        'frontend: React v18 + Vite',
        'styling: Tailwind CSS v3',
        'backend: Express + TypeScript',
        'database: SQLite + Prisma ORM',
      ],
    }),
  });
  if (!saveStackRes.ok) throw new Error('Simpan stack gagal');

  console.log('\n=== 5. GENERATE PRD DARI CHAT HISTORY ===');
  const prdRes = await authedFetch(`/api/projects/${projectId}/prd/generate`, { method: 'POST' });
  if (!prdRes.ok) throw new Error(`Generate PRD gagal: ${await prdRes.text()}`);
  const prdJson = await prdRes.json();
  const prdObj = prdJson.prd ?? prdJson.brd;
  const endpoints = prdObj?.content?.apiEndpoints || [];
  console.log(`PRD sukses dibuat. Total endpoints: ${endpoints.length}`);
  endpoints.forEach((ep: any) => console.log(`  - [${ep.method}] ${ep.path}: ${ep.description}`));

  console.log('\n=== 6. GENERATE TREE DIAGRAM ===');
  const treeRes = await authedFetch(`/api/projects/${projectId}/tree/generate`, { method: 'POST' });
  if (!treeRes.ok) throw new Error(`Generate tree gagal: ${await treeRes.text()}`);
  const treeJson = await treeRes.json();
  console.log(`Tree sukses dibuat: ${treeJson.count} node`);

  console.log('\n=== 7. GENERATE BOARD TASKS DENGAN PARITY COVERAGE ===');
  const tasksRes = await authedFetch(`/api/projects/${projectId}/tasks/generate`, { method: 'POST' });
  if (!tasksRes.ok) throw new Error(`Generate tasks gagal: ${await tasksRes.text()}`);
  const tasksJson = await tasksRes.json();
  console.log(`Tasks sukses dibuat: ${tasksJson.count} tasks`);

  const listTasksRes = await authedFetch(`/api/projects/${projectId}/tasks`);
  const listTasksJson = await listTasksRes.json();

  console.log('\n--- DAFTAR TASK & PARITAS API-TO-UI ---');
  listTasksJson.tasks.forEach((t: any) => {
    console.log(`\n[${t.layer}] #${t.order}: ${t.title}`);
    if (t.aiContext?.files_to_create?.length) {
      console.log('  files_to_create:', t.aiContext.files_to_create.join(', '));
    }
    if (t.apiContracts?.length) {
      console.log('  apiContracts (Backend):', t.apiContracts.map((c: any) => `${c.method} ${c.path}`).join(' | '));
    }
    if (t.aiContext?.consumesApis?.length) {
      console.log('  consumesApis (Frontend):', t.aiContext.consumesApis.map((c: any) => `${c.method} ${c.path}`).join(' | '));
    }
  });

  console.log('\n=== 8. GENERATE PAT TOKEN & MASTER PROMPT (PANDUAN) ===');
  const rawToken = await issueCliToken(authedFetch);
  console.log('Token CLI berhasil dibuat lewat login device code.');

  const guideRes = await authedFetch(`/api/projects/${projectId}/master-prompt`);
  if (!guideRes.ok) throw new Error(`Ambil master-prompt gagal: ${await guideRes.text()}`);
  const guideJson = await guideRes.json();
  const masterPrompt = guideJson.prompt;
  console.log('Master Prompt diambil. Panjang:', masterPrompt.length, 'karakter.');

  // Siapkan direktori target
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // Tulis panduan dan token ke direktori project agar user/agent bisa langsung membacanya
  fs.writeFileSync(path.join(TARGET_DIR, 'PANDUAN_AGENT.md'), masterPrompt, 'utf8');
  fs.writeFileSync(
    path.join(TARGET_DIR, 'AGENT_CONFIG.json'),
    JSON.stringify(
      {
        projectId,
        projectName: project.name,
        token: rawToken,
        apiUrl: API_BASE,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log('\nFile panduan tersimpan di:');
  console.log(`- ${TARGET_DIR}/PANDUAN_AGENT.md`);
  console.log(`- ${TARGET_DIR}/AGENT_CONFIG.json`);

  return {
    projectId,
    rawToken,
    targetDir: TARGET_DIR,
  };
}

run()
  .then((res) => {
    console.log('\n=== PROSES GENERATE WIZARD SELESAI SUKSES ===');
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nPROSES GAGAL:', err);
    process.exit(1);
  });
