// Real E2E Wizard Flow Test: Idea -> Survey (Free Gate) -> Upgrade -> TechStack -> PRD (+ journey) -> Tasks -> Agent CLI -> Change Cycle
import assert from 'node:assert';
import { prisma } from '../apps/api/src/lib/prisma.js';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:6655';

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

// Helper: poll AI job sampai selesai (max 300 detik)
async function pollJob(authedFetch: (path: string, opts?: RequestInit) => Promise<Response>, projectId: string, jobType: string, label: string) {
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await authedFetch(`/api/projects/${projectId}/ai-jobs?type=${jobType}`);
    if (res.status === 200) {
      const data = await res.json();
      if (data.status === 'done') { console.log(`\n${label} selesai`); return data; }
      if (data.status === 'failed') throw new Error(`${label} gagal: ${data.error}`);
    }
    process.stdout.write('.');
  }
  throw new Error(`${label} timeout setelah 300 detik`);
}

async function runTest() {
  console.log('--- 1. TEST REGISTER & LOGIN ---');
  const uniqueEmail = `test-wizard-${Date.now()}@numa.dev`;
  const password = 'password123';

  // Register
  const regRes = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3455' },
    body: JSON.stringify({ name: 'Tester Wizard', email: uniqueEmail, password }),
  });
  assert.strictEqual(regRes.status, 200, 'Register status harus 200');
  const regCookie = regRes.headers.get('set-cookie');
  console.log('Register berhasil:', uniqueEmail);

  // Login
  const loginRes = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3455' },
    body: JSON.stringify({ email: uniqueEmail, password }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login status harus 200');
  const setCookie = loginRes.headers.get('set-cookie') || regCookie || '';
  const tokenMatch = setCookie.match(/(__Secure-)?better-auth\.session_token=([^;]+)/);
  assert(tokenMatch, 'Cookie session token harus ada');
  const cookieName = tokenMatch[1] ? '__Secure-better-auth.session_token' : 'better-auth.session_token';
  const cookieHeader = `${cookieName}=${tokenMatch[2]}`;
  console.log('Login berhasil, session token diperoleh');

  // Helper authed fetch
  const authedFetch = async (path: string, options: RequestInit = {}) => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        ...(options.headers || {}),
      },
    });
  };

  // Verifikasi info plan awal (Free Trial)
  const userPlanRes = await authedFetch('/api/user/plan');
  assert.strictEqual(userPlanRes.status, 200, 'User plan status harus 200');
  const userPlanJson = await userPlanRes.json();
  assert.strictEqual(userPlanJson.plan, 'free', 'Plan awal harus free');
  assert.strictEqual(userPlanJson.surveyRounds, 1, 'Survey rounds free harus 1');
  console.log('Verifikasi paket awal: Free Trial (surveyRounds=1)');

  console.log('\n--- 2. TEST FINALIZE IDE (SATU REQUEST) ---');
  const rawIdea = 'Saya ingin membuat aplikasi kasir warung kelontong berbasis web dengan inventaris barang, kasir POS cepat, dan rekap omzet harian.';

  // Finalize chat langsung dengan ide mentah user -> Buat draft project di tahap survey
  console.log('\n--- 3. TEST FINALIZE PROJECT -> DRAFT SURVEY ---');
  const finalizeRes = await authedFetch('/api/chat/finalize', {
    method: 'POST',
    body: JSON.stringify({ idea: rawIdea }),
  });
  assert.strictEqual(finalizeRes.status, 201, 'Finalize status harus 201');
  const { projectId } = await finalizeRes.json();
  assert(projectId, 'ProjectId harus ada setelah finalize');
  console.log('Project berhasil dibuat dengan tahap survey:', projectId);

  // Cek project data
  const projectRes = await authedFetch(`/api/projects/${projectId}`);
  const projectJson = await projectRes.json();
  assert.strictEqual(projectJson.project.wizardStep, 'survey', 'wizardStep harus survey setelah ide dikirim');
  console.log('Project status: wizardStep =', projectJson.project.wizardStep);

  console.log('\n--- 4. TEST SURVEY WIZARD (PUTARAN 1 & SARAN NUMA) ---');
  // Trigger generate pertanyaan survey putaran 1 (async job)
  const surveyGenRes = await authedFetch(`/api/projects/${projectId}/survey/generate`, { method: 'POST' });
  assert([200, 201, 202].includes(surveyGenRes.status), `POST survey/generate status harus 200/201/202, got ${surveyGenRes.status}`);
  console.log('Survey generate dimulai, polling status...');
  await pollJob(authedFetch, projectId, 'survey_round', 'Survey generate');

  // Ambil pertanyaan survey putaran 1
  const surveyGetRes = await authedFetch(`/api/projects/${projectId}/survey`);
  assert.strictEqual(surveyGetRes.status, 200, 'GET survey status harus 200');
  const surveyGetData = await surveyGetRes.json();
  assert(Array.isArray(surveyGetData.questions) && surveyGetData.questions.length > 0, 'Survey harus memiliki daftar pertanyaan');
  assert.strictEqual(surveyGetData.round, 1, 'Survey awal harus putaran 1');
  assert.strictEqual(surveyGetData.totalRounds, 1, 'Total rounds untuk Free harus 1');

  console.log(`Survey putaran 1 memuat ${surveyGetData.questions.length} pertanyaan:`);
  for (const q of surveyGetData.questions) {
    console.log(` - [#${q.order}] ${q.label}`);
    console.log(`   Saran Numa: "${q.suggestion}" (${q.suggestionReason})`);
    assert(q.suggestion, 'Pertanyaan harus memuat saran Numa');
    assert(Array.isArray(q.options) && q.options.length >= 3, 'Pertanyaan harus punya minimal 3 opsi');
  }

  // Kirim jawaban survey putaran 1 menggunakan Saran Numa
  const answersToSubmit = surveyGetData.questions.map((q: any) => ({
    questionId: q.id,
    value: q.kind === 'checkbox' ? [q.suggestion] : q.suggestion,
  }));

  const submitSurveyRes = await authedFetch(`/api/projects/${projectId}/survey/submit`, {
    method: 'POST',
    body: JSON.stringify({
      round: 1,
      answers: answersToSubmit,
    }),
  });
  if (submitSurveyRes.status !== 200) {
    const errorBody = await submitSurveyRes.text();
    console.error('Submit survey error response:', submitSurveyRes.status, errorBody);
  }
  assert.strictEqual(submitSurveyRes.status, 200, 'Submit survey status harus 200');
  const submitSurveyData = await submitSurveyRes.json();
  assert.strictEqual(submitSurveyData.done, true, 'Survey free harus selesai setelah putaran 1');

  // Summary di-generate async — poll sampai selesai
  if (submitSurveyData.status === 'generating' || !submitSurveyData.summary) {
    console.log('Survey summary sedang di-generate, polling...');
    await pollJob(authedFetch, projectId, 'survey_summary', 'Survey summary');
  }

  // Ambil summary dari project data
  const projAfterSummary = await authedFetch(`/api/projects/${projectId}`);
  const projSummaryJson = await projAfterSummary.json();
  const summary = projSummaryJson.project?.description;
  assert(summary, 'Survey harus menghasilkan ringkasan produk terstruktur');
  console.log('Survey putaran 1 selesai. Ringkasan produk:\n', summary.substring(0, 150) + '...');

  // Verifikasi survey selesai tersimpan
  const surveyAfterSubmit = await authedFetch(`/api/projects/${projectId}/survey`);
  const surveyAfterData = await surveyAfterSubmit.json();
  assert.strictEqual(surveyAfterData.isComplete, true, 'isComplete harus true');

  console.log('\n--- 5. TEST FREE TIER PAYWALL GATE (TEMBOK UPGRADE) ---');
  // 5a. Akses /survey/complete harus ditolak untuk akun Free
  const gateSurveyCompleteRes = await authedFetch(`/api/projects/${projectId}/survey/complete`, { method: 'POST' });
  assert.strictEqual(gateSurveyCompleteRes.status, 403, 'Akses /survey/complete untuk free harus 403');
  const gateSurveyJson = await gateSurveyCompleteRes.json();
  assert.strictEqual(gateSurveyJson.code, 'plan_upgrade_required', 'Error code harus plan_upgrade_required');
  console.log('Tembok upgrade survey/complete berhasil diverifikasi (HTTP 403 plan_upgrade_required).');

  // 5b. Generate PRD harus ditolak untuk akun Free
  const gatePrdRes = await authedFetch(`/api/projects/${projectId}/prd/generate`, { method: 'POST' });
  assert.strictEqual(gatePrdRes.status, 403, 'Akses /prd/generate untuk free harus 403');
  const gatePrdJson = await gatePrdRes.json();
  assert.strictEqual(gatePrdJson.code, 'plan_upgrade_required', 'Error code harus plan_upgrade_required');
  console.log('Tembok upgrade prd/generate berhasil diverifikasi (HTTP 403 plan_upgrade_required).');

  console.log('\n--- 6. UPGRADE PLAN KE STARTER & LANJUT KE TECH STACK ---');
  // Cari user id untuk update subscription
  const userRecord = await prisma.user.findUnique({ where: { email: uniqueEmail } });
  assert(userRecord, 'User record harus ditemukan di DB');

  await prisma.subscription.upsert({
    where: { userId: userRecord.id },
    update: { plan: 'starter', quotaMax: 2 },
    create: { userId: userRecord.id, plan: 'starter', quotaUsed: 0, quotaMax: 2 },
  });
  console.log('Akun berhasil di-upgrade ke Starter di DB.');

  // Selesaikan survey sekarang setelah upgrade
  const completeSurveyRes = await authedFetch(`/api/projects/${projectId}/survey/complete`, { method: 'POST' });
  assert.strictEqual(completeSurveyRes.status, 200, 'Survey complete status harus 200');
  const completeSurveyJson = await completeSurveyRes.json();
  assert.strictEqual(completeSurveyJson.wizardStep, 'techstack', 'wizardStep harus techstack');
  console.log('Tahap berhasil beralih ke techstack.');

  console.log('\n--- 7. TEST TECH STACK (REKOMENDASI ARSITEK SOFTWARE) ---');
  // Rekomendasi tech stack (async job)
  const stackRecRes = await authedFetch(`/api/projects/${projectId}/techstack/recommend`, { method: 'POST' });
  assert.strictEqual(stackRecRes.status, 200, 'Tech stack recommend harus 200');
  console.log('Techstack recommend dimulai, polling status...');
  const stackJob = await pollJob(authedFetch, projectId, 'techstack_recommend', 'Techstack recommend');
  const stackRecJson = stackJob.result || {};
  console.log('Tech stack rekomendasi:', stackRecJson.techStack);

  // Uji validasi penolakan Golden Stack (mis. MongoDB atau framework di luar whitelist)
  const invalidStack = ['frontend: React v18', 'backend: Flask', 'database: MongoDB'];
  const invalidStackRes = await authedFetch(`/api/projects/${projectId}/techstack`, {
    method: 'PUT',
    body: JSON.stringify({ techStack: invalidStack }),
  });
  assert.strictEqual(invalidStackRes.status, 400, 'Tech stack non-whitelist harus ditolak dengan status 400');
  console.log('Validasi penolakan Golden Stack non-whitelist OK (status 400).');

  // Simpan tech stack dengan format kategori dan versi eksplisit
  const customStack = ['frontend: React v18', 'backend: Express v4', 'database: SQLite + Prisma', 'styling: Tailwind CSS', 'testing: Playwright'];
  const saveStackRes = await authedFetch(`/api/projects/${projectId}/techstack`, {
    method: 'PUT',
    body: JSON.stringify({ techStack: customStack }),
  });
  assert.strictEqual(saveStackRes.status, 200, 'Save tech stack status harus 200');
  console.log('Tech stack tersimpan.');

  // Verifikasi parsing stack di DB
  const projAfterStack = await authedFetch(`/api/projects/${projectId}`);
  const projAfterStackJson = await projAfterStack.json();
  const feStack = projAfterStackJson.project.stacks?.find((s: any) => s.category === 'frontend');
  assert(feStack, 'Stack frontend harus ada');
  assert.strictEqual(feStack.name, 'React', 'Nama stack frontend harus React');
  assert.strictEqual(feStack.version, '18', 'Versi stack frontend harus 18');
  console.log('Verifikasi stack contract OK: React v18.');

  console.log('\n--- 8. TEST PRD (GENERATE DARI SURVEY KEBUTUHAN) ---');
  // Generate PRD (sekarang diizinkan karena sudah paket Starter)
  const prdGenRes = await authedFetch(`/api/projects/${projectId}/prd/generate`, { method: 'POST' });
  assert.strictEqual(prdGenRes.status, 200, 'PRD generate status harus 200');
  assert.strictEqual((await prdGenRes.json()).status, 'generating', 'PRD generate harus mengembalikan status generating');
  // Generate ganda saat job berjalan tidak boleh membuat job kedua (idempoten)
  const prdGenAgain = await authedFetch(`/api/projects/${projectId}/prd/generate`, { method: 'POST' });
  assert.strictEqual(prdGenAgain.status, 200, 'Generate PRD kedua harus tetap 200 (idempoten)');
  await pollJob(authedFetch, projectId, 'prd_generate', 'Generate PRD');
  // Spec terstruktur (journey) disusun di background setelah PRD tersimpan
  await pollJob(authedFetch, projectId, 'prd_spec', 'Ekstraksi spec PRD');
  console.log('PRD berhasil digenerate.');

  // Ambil PRD
  const prdGetRes = await authedFetch(`/api/projects/${projectId}/prd`);
  const prdGetJson = await prdGetRes.json();
  const prdContent = prdGetJson.prd?.content ?? prdGetJson.brd?.content;
  assert(prdContent, 'PRD content harus ada');
  const markdownText = typeof prdContent === 'string' ? prdContent : prdContent.markdown;
  assert(typeof markdownText === 'string' && markdownText.length > 0, 'PRD markdown harus valid');
  console.log(`PRD check OK: markdown length ${markdownText.length} bytes.`);

  // Test Download PRD .md
  const prdDownloadRes = await authedFetch(`/api/projects/${projectId}/prd/download`);
  assert.strictEqual(prdDownloadRes.status, 200, 'Download PRD status harus 200');
  const prdMdText = await prdDownloadRes.text();
  assert(prdMdText.includes('# Product Requirements Document'), 'Konten PRD.md harus valid');
  console.log('Download PRD .md OK.');

  console.log('\n--- 9. TEST JOURNEY DI SPEC PRD ---');
  const journeys: Array<{ name: string; kind?: string; steps: string[]; branchFrom?: { journey: string; stepIndex: number } }> =
    prdContent.spec?.journeys ?? [];
  assert(journeys.length > 0, 'Spec PRD harus memiliki journey');
  const mainJourneys = journeys.filter((j) => (j.kind ?? 'main') === 'main');
  assert(mainJourneys.length > 0, 'Harus ada minimal satu journey utama');
  const mainNames = new Set(mainJourneys.map((j) => j.name.trim().toLowerCase()));
  const failureJourneys = journeys.filter((j) => j.kind === 'failure');
  for (const f of failureJourneys) {
    assert(f.branchFrom, `Journey gagal "${f.name}" harus memiliki branchFrom`);
    assert(mainNames.has(f.branchFrom.journey.trim().toLowerCase()), `branchFrom "${f.branchFrom.journey}" harus merujuk journey utama`);
  }
  console.log(`Journey check OK: ${mainJourneys.length} utama, ${failureJourneys.length} gagal.`);

  console.log('\n--- 10. TEST BOARD TASKS (TECH LEAD) ---');
  // Generate Tasks (async job)
  const tasksGenRes = await authedFetch(`/api/projects/${projectId}/tasks/generate`, { method: 'POST' });
  assert.strictEqual(tasksGenRes.status, 200, 'Tasks generate status harus 200');
  console.log('Tasks generate dimulai, polling status...');
  await pollJob(authedFetch, projectId, 'tasks_generate', 'Tasks generate');

  // Ambil Tasks
  const tasksGetRes = await authedFetch(`/api/projects/${projectId}/tasks`);
  const tasksGetJson = await tasksGetRes.json();
  assert(tasksGetJson.tasks.length > 0, 'Tasks harus ada');

  // Verifikasi struktur task
  for (const t of tasksGetJson.tasks) {
    assert(Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length > 0, `Task #${t.order} harus memiliki acceptanceCriteria`);
    assert(Array.isArray(t.aiContext?.validation_commands) && t.aiContext.validation_commands.length > 0, `Task #${t.order} harus memiliki validation_commands`);
    assert(Array.isArray(t.aiContext?.requirement_ids), `Task #${t.order} harus memiliki requirement_ids`);
  }
  console.log(`Verifikasi semua ${tasksGetJson.tasks.length} task memiliki acceptance criteria, validation commands, dan requirement_ids OK.`);
  assert(
    tasksGetJson.tasks.some((t: { acceptanceCriteria: string[] }) => t.acceptanceCriteria.some((c) => c.includes('Skenario E2E S1'))),
    'Skenario E2E dari journey harus disuntikkan ke task INTEGRATION'
  );
  console.log('Skenario E2E dari journey tersuntik ke task INTEGRATION OK.');

  // Mode ringkas: berhenti setelah task terbentuk (dipakai untuk mengukur pemakaian token wizard 1-5).
  // Audit keamanan berjalan di background; ditunggu agar tokennya ikut terhitung.
  if (process.env.E2E_STOP_AFTER_TASKS) {
    await pollJob(authedFetch, projectId, 'security_audit', 'Audit keamanan (background)');
    console.log(`E2E_PROJECT_ID=${projectId}`);
    console.log('\n=== E2E WIZARD 1-5 SAMPAI TASK BERHASIL ===');
    return;
  }

  console.log('\n--- 11. TEST EXPORT PAKET ZIP & WIZARD STEP UNLOCK ---');
  // 11a. Test bahwa paket Starter dilarang download export.zip (harus 403, fitur Pro)
  const zipStarterRes = await authedFetch(`/api/projects/${projectId}/export.zip`);
  assert.strictEqual(zipStarterRes.status, 403, 'Download ZIP di paket Starter harus 403');
  console.log('Verifikasi proteksi export.zip (hanya paket Pro) OK.');

  // 11b. Upgrade ke Pro untuk unduh ZIP
  await prisma.subscription.update({
    where: { userId: userRecord.id },
    data: { plan: 'pro', quotaMax: 5 },
  });

  const zipRes = await authedFetch(`/api/projects/${projectId}/export.zip`);
  assert.strictEqual(zipRes.status, 200, 'Download ZIP status harus 200');
  const contentType = zipRes.headers.get('content-type');
  assert(contentType?.includes('application/zip'), 'Content-Type harus application/zip');
  const zipArrayBuffer = await zipRes.arrayBuffer();
  assert(zipArrayBuffer.byteLength > 100, 'Ukuran file ZIP harus valid');
  console.log(`Download Paket ZIP (paket Pro) OK: ${zipArrayBuffer.byteLength} bytes.`);

  // Test Mundur Wizard Step
  const stepBackRes = await authedFetch(`/api/projects/${projectId}/wizard-step`, {
    method: 'POST',
    body: JSON.stringify({ step: 'prd' }),
  });
  assert.strictEqual(stepBackRes.status, 200, 'Step back status harus 200');
  const stepBackJson = await stepBackRes.json();
  assert.strictEqual(stepBackJson.wizardStep, 'prd', 'Wizard step harus menjadi prd');
  console.log('Unlock tahap sebelumnya (wizard-step: prd) OK.');

  // Kembalikan ke board via direct DB update (skip re-generate yang lambat)
  await prisma.project.update({
    where: { id: projectId },
    data: { wizardStep: 'board' },
  });
  console.log('Restore wizard-step ke board OK.');

  console.log('\n--- 12. TEST CLI TOKEN & MASTER PROMPT ---');
  // Generate token untuk CLI agent
  const rawToken = await issueCliToken(authedFetch);
  assert(rawToken, 'Plaintext token harus ada');
  console.log('Token CLI berhasil dibuat lewat login device code:', rawToken.substring(0, 10) + '...');

  // Ambil master prompt
  const promptRes = await authedFetch(`/api/projects/${projectId}/master-prompt`);
  assert.strictEqual(promptRes.status, 200, 'Master prompt status harus 200');
  const promptJson = await promptRes.json();
  assert(promptJson.prompt.includes('numa next'), 'Prompt harus memuat loop instruksi CLI');
  console.log('Master prompt berhasil diambil.');

  // Test CLI agent loop API dengan Bearer token
  console.log('\n--- 13. TEST CLI AGENT LOOP ---');
  const agentFetch = async (path: string, options: RequestInit = {}) => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rawToken}`,
        'X-Project-ID': projectId,
        ...(options.headers || {}),
      },
    });
  };

  const nextRes = await agentFetch('/api/agent/tasks/next');
  assert.strictEqual(nextRes.status, 200, 'Agent next status harus 200');
  const nextJson = await nextRes.json();
  console.log('Next task for agent:', nextJson.task?.title);

  if (nextJson.task) {
    const taskId = nextJson.task.id;
    const startRes = await agentFetch(`/api/agent/tasks/${taskId}/start`, { method: 'POST' });
    assert.strictEqual(startRes.status, 200, 'Agent start task status harus 200');
    console.log('Agent start task OK');

    const ctxRes = await agentFetch(`/api/agent/tasks/${taskId}/context`);
    assert.strictEqual(ctxRes.status, 200, 'Agent context status harus 200');
    const ctxJson = await ctxRes.json();

    assert(Array.isArray(ctxJson.guard?.validation_commands), 'Guard harus memuat validation_commands');
    console.log(`Guard validation_commands terdaftar: ${ctxJson.guard.validation_commands.length} commands`);

    const { runGuard } = await import('../packages/cli/src/guard.js');
    await runGuard(
      {
        validation_commands: ['echo "validation ok"'],
      },
      process.cwd(),
      taskId
    );
    console.log('Verifikasi CLI Guard lolos pada command valid OK.');

    const doneRes = await agentFetch(`/api/agent/tasks/${taskId}/complete`, { method: 'POST' });
    assert.strictEqual(doneRes.status, 200, 'Agent done task status harus 200');
    console.log('Agent complete task OK');
  }

  console.log('\n--- 12. TEST AGENT ARCHITECTURE CONTRACT & REPO SUMMARY ---');
  // Ambil kontrak arsitektur via agent
  const archRes = await agentFetch('/api/agent/architecture-contract');
  assert.strictEqual(archRes.status, 200, 'Architecture contract agent status harus 200');
  const archJson = await archRes.json();
  assert.strictEqual(archJson.contractKey, 'express', 'Contract key harus express');
  assert(typeof archJson.markdown === 'string' && archJson.markdown.includes('Express'), 'Markdown arsitektur harus memuat panduan Express');
  console.log('Verifikasi architecture contract agent OK:', archJson.contractKey);

  // Unggah ringkasan workspace (numa sync)
  const syncRes = await agentFetch('/api/agent/repo-summary', {
    method: 'POST',
    body: JSON.stringify({
      summary: 'Monorepo test-app: src/index.ts (entry), src/routes.ts (router), package.json. Total 3 files.',
    }),
  });
  assert.strictEqual(syncRes.status, 200, 'Repo summary status harus 200');
  console.log('Verifikasi simpan repo-summary OK.');

  // Selesaikan seluruh sisa task awal agar siap Change Cycle
  const allTasksRes = await authedFetch(`/api/projects/${projectId}/tasks`);
  const allTasksJson = await allTasksRes.json();
  for (const t of allTasksJson.tasks || []) {
    if (t.status !== 'DONE') {
      await authedFetch(`/api/tasks/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' }),
      });
    }
  }
  console.log('Semua task pembangunan awal telah berstatus DONE.');

  console.log('\n--- 13. TEST CHANGE CYCLE RINGAN ("MINTA PERUBAHAN") ---');
  const prdBeforeRes = await authedFetch(`/api/projects/${projectId}/prd`);
  const prdBeforeJson = await prdBeforeRes.json();
  const prdVersionBefore: number = prdBeforeJson.prd?.version ?? prdBeforeJson.brd?.version;
  const prdBefore = prdBeforeJson.prd?.content ?? prdBeforeJson.brd?.content;
  const frBefore = new Set<string>(((prdBefore.requirementIndex ?? []) as Array<{ id: string }>).map((r) => r.id));

  // Ajukan permintaan perubahan: siklus DRAFT dibuat dan dianalisis; survey dan wizard tidak diulang
  const changeReqRes = await authedFetch(`/api/projects/${projectId}/change-request`, {
    method: 'POST',
    body: JSON.stringify({
      request: 'Tambahkan validasi email pada formulir kontak dan tombol ekspor CSV untuk log aktivitas',
    }),
  });
  assert.strictEqual(changeReqRes.status, 200, 'Change request status harus 200');
  const changeReqJson = await changeReqRes.json();
  const cycleId: string = changeReqJson.cycleId;
  assert(cycleId, 'Change request harus mengembalikan cycleId');
  assert.strictEqual(changeReqJson.status, 'analyzing', 'Change request harus langsung menganalisis');
  console.log('Permintaan perubahan diterima. Siklus DRAFT:', cycleId);

  // Hanya satu draf per project
  const dupReqRes = await authedFetch(`/api/projects/${projectId}/change-request`, {
    method: 'POST',
    body: JSON.stringify({ request: 'Permintaan kedua saat draf masih ada' }),
  });
  assert.strictEqual(dupReqRes.status, 409, 'Permintaan kedua saat draf ada harus 409');
  assert.strictEqual((await dupReqRes.json()).code, 'cycle_draft_exists', 'Kode 409 harus cycle_draft_exists');

  // Konfirmasi sebelum analisis selesai ditolak
  const earlyGenRes = await authedFetch(`/api/projects/${projectId}/cycles/${cycleId}/generate`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true, split: 'single' }),
  });
  assert.strictEqual(earlyGenRes.status, 409, 'Generate sebelum analisis selesai harus 409');

  await pollJob(authedFetch, projectId, 'cycle_analyze', 'Analisis dampak perubahan');

  const loadDraft = async () => {
    const res = await authedFetch(`/api/projects/${projectId}/cycles`);
    assert.strictEqual(res.status, 200, 'GET cycles status harus 200');
    const json = await res.json();
    const draft = (json.cycles as any[]).find((c) => c.id === cycleId);
    assert(draft, 'Draf siklus harus ada');
    return { json, draft };
  };

  // Klarifikasi (bila kabur): jawab dengan saran Numa; maksimal 2 putaran, setelah itu analisis dipaksa CLEAR
  let { json: cyclesJson, draft } = await loadDraft();
  assert.strictEqual(cyclesJson.draftCycleId, cycleId, 'draftCycleId harus menunjuk draf');
  for (let putaran = 1; draft.impact?.clarity === 'VAGUE'; putaran++) {
    assert(putaran <= 2, 'Klarifikasi tidak boleh melebihi 2 putaran');
    console.log(`Permintaan kabur, klarifikasi putaran ${putaran}...`);
    const answers = (draft.impact.clarificationQuestions as any[]).map((q) => ({
      questionId: q.id,
      answer: q.suggestion ?? q.options[0],
    }));
    const clarifyRes = await authedFetch(`/api/projects/${projectId}/cycles/${cycleId}/clarify`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
    assert.strictEqual(clarifyRes.status, 200, 'Clarify status harus 200');
    await pollJob(authedFetch, projectId, 'cycle_analyze', `Analisis ulang putaran ${putaran}`);
    ({ json: cyclesJson, draft } = await loadDraft());
  }
  assert.strictEqual(draft.impact?.clarity, 'CLEAR', 'Analisis akhir harus CLEAR');
  assert(typeof draft.impact?.summary === 'string' && draft.impact.summary.length > 0, 'Analisis harus punya ringkasan');
  console.log(`Analisis selesai: tipe ${draft.impact.type}, skala ${draft.impact.size}, perlu ubah PRD: ${draft.impact.needsPrdChange}.`);

  // Konfirmasi: pecah ditolak bila tidak ada usulan pemecahan; selain itu kerjakan utuh
  const hasSplit = Boolean(draft.impact.splitProposal?.partA && draft.impact.splitProposal?.partB);
  if (!hasSplit) {
    const badSplitRes = await authedFetch(`/api/projects/${projectId}/cycles/${cycleId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true, split: 'a' }),
    });
    assert.strictEqual(badSplitRes.status, 400, 'Split tanpa usulan pemecahan harus 400');
  }
  const cycleGenRes = await authedFetch(`/api/projects/${projectId}/cycles/${cycleId}/generate`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true, split: 'single' }),
  });
  assert.strictEqual(cycleGenRes.status, 200, 'Cycle generate status harus 200');
  await pollJob(authedFetch, projectId, 'cycle_generate', 'Perancangan task siklus');

  // Siklus OPEN, task bertanda cycleId, survey dan wizard tidak diulang
  ({ json: cyclesJson, draft } = await loadDraft());
  assert.strictEqual(draft.status, 'OPEN', 'Siklus harus OPEN setelah task dirancang');
  assert(draft.taskCounts.total > 0, 'Siklus harus punya task');
  assert.strictEqual(cyclesJson.openCycleId, cycleId, 'openCycleId harus menunjuk siklus');
  const cycleTasksRes = await authedFetch(`/api/projects/${projectId}/tasks?cycleId=${cycleId}`);
  const cycleTasks = (await cycleTasksRes.json()).tasks as any[];
  assert.strictEqual(cycleTasks.length, draft.taskCounts.total, 'Jumlah task siklus harus sama dengan hitungan siklus');
  assert(cycleTasks.every((t) => t.cycleId === cycleId), 'Semua task siklus harus bertanda cycleId');
  console.log(`Siklus #${draft.number} OPEN dengan ${cycleTasks.length} task.`);

  const projectAfterRes = await authedFetch(`/api/projects/${projectId}`);
  assert.strictEqual((await projectAfterRes.json()).project.wizardStep, 'board', 'wizardStep harus tetap board');

  // PRD: requirement baru dinomori lanjutan FR dan terbaca di indeks (bila analisis mengubah PRD)
  if (draft.impact.needsPrdChange && draft.impact.newRequirements?.length > 0) {
    const prdAfterRes = await authedFetch(`/api/projects/${projectId}/prd`);
    const prdAfterJson = await prdAfterRes.json();
    const prdAfter = prdAfterJson.prd?.content ?? prdAfterJson.brd?.content;
    assert((prdAfterJson.prd?.version ?? prdAfterJson.brd?.version) > prdVersionBefore, 'Versi PRD harus naik');
    assert(prdAfter.markdown.includes('Perubahan Siklus'), 'Markdown PRD harus memuat bagian Perubahan Siklus');
    const newIds = (draft.impact.newRequirements as Array<{ id: string }>).map((r) => r.id);
    for (const id of newIds) {
      assert(/^FR-\d{3,}$/.test(id), `Requirement baru ${id} harus bernomor FR-NNN`);
      assert(!frBefore.has(id), `Requirement baru ${id} tidak boleh menimpa FR lama`);
      assert(
        (prdAfter.requirementIndex as Array<{ id: string }>).some((r) => r.id === id),
        `Requirement baru ${id} harus ada di requirementIndex`
      );
    }
    console.log(`PRD diperbarui: ${newIds.join(', ')} masuk indeks requirement.`);
  }

  // Siklus aktif menolak permintaan perubahan baru
  const blockedReqRes = await authedFetch(`/api/projects/${projectId}/change-request`, {
    method: 'POST',
    body: JSON.stringify({ request: 'Permintaan baru saat siklus masih berjalan' }),
  });
  assert.strictEqual(blockedReqRes.status, 409, 'Permintaan saat siklus OPEN harus 409');

  console.log('\n=== SEMUA TEST E2E BERHASIL 100%! ===');
}

runTest().catch((err) => {
  console.error('TEST E2E GAGAL:', err);
  process.exit(1);
});
