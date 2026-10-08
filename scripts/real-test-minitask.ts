import assert from 'node:assert';

const API_BASE = process.env.NUMA_API_URL || 'http://localhost:6655';

async function run() {
  console.log('--- 1. REGISTER & LOGIN REAL TEST USER ---');
  const email = `test-minitask-${Date.now()}@numa.dev`;
  const password = 'PasswordSuperAman123!';

  const regRes = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3455',
    },
    body: JSON.stringify({ name: 'Jerry Tester', email, password }),
  });
  assert(regRes.ok, `Register gagal: ${await regRes.text()}`);

  const setCookie = regRes.headers.get('set-cookie');
  assert(setCookie, 'Harus mendapatkan cookie session');
  const sessionCookie = setCookie.split(';')[0];
  console.log('User terdaftar:', email);

  const authedFetch = (path: string, opts: RequestInit = {}) =>
    fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        ...(opts.headers || {}),
      },
    });

  console.log('\n--- 2. IDE AWAL ---');
  // User menjelaskan ide aplikasi minitask secara lengkap (aktor, auth, entitas, fitur)
  const initialIdea =
    'Saya ingin membuat aplikasi MiniTask: aplikasi manajemen tugas tim kecil sederhana. ' +
    'Pengguna bisa login dengan Google OAuth atau email. ' +
    'Ada 2 peran: Admin (pemilik proyek) dan Anggota biasa. ' +
    'Entitas utama: Workspace (ruang kerja), Project, Task, dan Member. ' +
    'Fitur wajib MVP: ' +
    '1. Admin membuat ruang kerja (workspace) dan mengundang anggota baru lewat modal dialog InviteMember. ' +
    '2. Admin/Anggota membuat tugas baru dengan prioritas dan deadline. ' +
    '3. Anggota bisa klaim tugas secara mandiri dan ubah status (TODO, IN_PROGRESS, DONE). ' +
    '4. Dialog edit tugas untuk memperbarui judul dan deskripsi tugas. ' +
    '5. Konfirmasi dialog untuk menghapus tugas.';

  console.log('\n--- 3. FINALIZE CHAT (Langsung ke Tech Stack) ---');
  const finalizeRes = await authedFetch('/api/chat/finalize', {
    method: 'POST',
    body: JSON.stringify({ idea: initialIdea }),
  });
  if (!finalizeRes.ok) {
    throw new Error(`Finalisasi chat gagal: ${await finalizeRes.text()}`);
  }
  const { projectId } = await finalizeRes.json();
  console.log('Project ID hasil chat:', projectId);

  const projCheck = await authedFetch(`/api/projects/${projectId}`);
  const projCheckJson = await projCheck.json();
  console.log('Project wizardStep:', projCheckJson.project.wizardStep);
  assert.strictEqual(projCheckJson.project.wizardStep, 'techstack', 'wizardStep harus langsung techstack!');

  console.log('\n--- 4. TAHAP TECH STACK ---');
  const stackRecRes = await authedFetch(`/api/projects/${projectId}/techstack/recommend`, { method: 'POST' });
  assert(stackRecRes.ok, 'Rekomendasi stack gagal');
  const stackRecJson = await stackRecRes.json();
  console.log('Stack rekomendasi:', stackRecJson.techStack);

  const saveStackRes = await authedFetch(`/api/projects/${projectId}/techstack`, {
    method: 'PUT',
    body: JSON.stringify({
      techStack: stackRecJson.techStack || [
        'frontend: React v18 + Vite',
        'styling: Tailwind CSS',
        'backend: Express + TypeScript',
        'database: SQLite + Prisma ORM',
      ],
    }),
  });
  assert(saveStackRes.ok, 'Simpan stack gagal');
  console.log('Tech stack tersimpan.');

  console.log('\n--- 5. TAHAP PRD (Generate dari Chat History) ---');
  const prdRes = await authedFetch(`/api/projects/${projectId}/prd/generate`, { method: 'POST' });
  if (!prdRes.ok) {
    throw new Error(`Generate PRD gagal: ${await prdRes.text()}`);
  }
  const prdJson = await prdRes.json();
  const prdObj = prdJson.prd ?? prdJson.brd;
  const endpoints = prdObj?.content?.apiEndpoints || [];
  console.log(`PRD berhasil. Total API endpoints terdefinisi: ${endpoints.length}`);
  endpoints.forEach((ep: any) => console.log(`  - [${ep.method}] ${ep.path}: ${ep.description}`));

  console.log('\n--- 6. TAHAP TREE DIAGRAM ---');
  const treeRes = await authedFetch(`/api/projects/${projectId}/tree/generate`, { method: 'POST' });
  if (!treeRes.ok) {
    throw new Error(`Generate Tree gagal: ${await treeRes.text()}`);
  }
  const treeJson = await treeRes.json();
  console.log(`Tree berhasil dibuat: ${treeJson.count} node`);

  console.log('\n--- 7. TAHAP BOARD TASKS (Dengan API-to-UI Parity Validator) ---');
  const tasksRes = await authedFetch(`/api/projects/${projectId}/tasks/generate`, { method: 'POST' });
  if (!tasksRes.ok) {
    throw new Error(`Generate tasks gagal: ${await tasksRes.text()}`);
  }
  const tasksJson = await tasksRes.json();
  console.log(`Board tasks berhasil digenerate: ${tasksJson.count} tasks`);

  const listTasksRes = await authedFetch(`/api/projects/${projectId}/tasks`);
  if (!listTasksRes.ok) {
    throw new Error(`Ambil tasks gagal: ${await listTasksRes.text()}`);
  }
  const listTasksJson = await listTasksRes.json();

  console.log('\nDetail Tasks yang Dihasilkan:');
  listTasksJson.tasks.forEach((t: any) => {
    console.log(`\n[${t.layer}] #${t.order}: ${t.title}`);
    if (t.aiContext?.files_to_create?.length) {
      console.log('  files_to_create:', t.aiContext.files_to_create.join(', '));
    }
    if (t.apiContracts?.length) {
      console.log('  apiContracts (Backend):', t.apiContracts.map((c: any) => `${c.method} ${c.path}`).join(', '));
    }
    if (t.aiContext?.consumesApis?.length) {
      console.log('  consumesApis (Frontend):', t.aiContext.consumesApis.map((c: any) => `${c.method} ${c.path}`).join(', '));
    }
  });

  console.log('\n--- 8. TAHAP GUIDE (Master Prompt & Agent Token) ---');
  const tokenRes = await authedFetch(`/api/projects/${projectId}/agent-tokens`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Jerry CLI Token' }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Generate token gagal: ${await tokenRes.text()}`);
  }
  const tokenJson = await tokenRes.json();
  const rawToken = tokenJson.token || tokenJson.plainToken;
  console.log('PAT Token berhasil dibuat:', rawToken);

  const guideRes = await authedFetch(`/api/projects/${projectId}/master-prompt`);
  if (!guideRes.ok) {
    throw new Error(`Ambil master-prompt gagal: ${await guideRes.text()}`);
  }
  const guideJson = await guideRes.json();
  console.log('Master Prompt berhasil diambil. Panjang:', guideJson.prompt.length, 'karakter.');

  // Output file json untuk dipakai langkah eksekusi CLI
  return {
    projectId,
    token: rawToken,
    sessionCookie,
  };
}

run()
  .then((res) => {
    console.log('\n=== REAL TEST WIZARD SUKSES 100% ===');
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nREAL TEST GAGAL:', err);
    process.exit(1);
  });
