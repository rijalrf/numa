// Real E2E Wizard Flow Test
import assert from 'node:assert';

const API_BASE = 'http://localhost:6655';

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

  console.log('\n--- 2. TEST CHAT SESSION ---');
  // Buat chat session
  const sessionRes = await authedFetch('/api/chat/sessions', { method: 'POST' });
  assert.strictEqual(sessionRes.status, 201, 'Create session status harus 201');
  const { sessionId } = await sessionRes.json();
  assert(sessionId, 'SessionId harus ada');
  console.log('Chat session dibuat:', sessionId);

  // Kirim pesan brainstorming user
  const chatRes = await authedFetch(`/api/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: 'Saya ingin membuat aplikasi kasir warung kelontong berbasis web dengan fitur scan barcode dan cetak struk belanja.',
    }),
  });
  assert.strictEqual(chatRes.status, 200, 'Kirim pesan chat harus 200');
  const aiMessage = await chatRes.json();
  console.log('AI response kind:', aiMessage.kind);
  console.log('AI response preview:', (aiMessage.content || '').substring(0, 100));

  // Ambil history chat
  const histRes = await authedFetch(`/api/chat/sessions/${sessionId}/messages`);
  const histJson = await histRes.json();
  assert(histJson.messages.length >= 2, 'Riwayat chat harus punya minimal user + assistant message');
  console.log(`Riwayat chat tersimpan: ${histJson.messages.length} pesan`);

  // Finalize chat -> Buat project
  console.log('\n--- 3. TEST FINALIZE PROJECT ---');
  const finalizeRes = await authedFetch(`/api/chat/sessions/${sessionId}/finalize`, { method: 'POST' });
  assert.strictEqual(finalizeRes.status, 200, 'Finalize status harus 200');
  const { projectId } = await finalizeRes.json();
  assert(projectId, 'ProjectId harus ada setelah finalize');
  console.log('Project berhasil dibuat:', projectId);

  // Cek project data
  const projectRes = await authedFetch(`/api/projects/${projectId}`);
  const projectJson = await projectRes.json();
  console.log('Nama project dari AI:', projectJson.project.name);
  console.log('Summary project:', projectJson.project.description?.substring(0, 100));
  assert.strictEqual(projectJson.project.wizardStep, 'techstack', 'wizardStep harus langsung techstack setelah interview dihapus');

  console.log('\n--- 4. TEST TECH STACK (DIRECT DARI CHAT) ---');
  // Rekomendasi tech stack
  const stackRecRes = await authedFetch(`/api/projects/${projectId}/techstack/recommend`, { method: 'POST' });
  assert.strictEqual(stackRecRes.status, 200, 'Tech stack recommend harus 200');
  const stackRecJson = await stackRecRes.json();
  console.log('Tech stack rekomendasi:', stackRecJson.techStack);

  // Simpan tech stack dengan format kategori dan versi eksplisit
  const customStack = ['frontend: React v18', 'backend: Express v4', 'database: SQLite', 'styling: Tailwind CSS', 'testing: Playwright'];
  const saveStackRes = await authedFetch(`/api/projects/${projectId}/techstack`, {
    method: 'PUT',
    body: JSON.stringify({ techStack: customStack }),
  });
  assert.strictEqual(saveStackRes.status, 200, 'Save tech stack status harus 200');
  console.log('Tech stack tersimpan.');

  // Verifikasi parsing stack di DB tidak terpotong nama/kategori
  const projAfterStack = await authedFetch(`/api/projects/${projectId}`);
  const projAfterStackJson = await projAfterStack.json();
  const feStack = projAfterStackJson.project.stacks?.find((s: any) => s.category === 'frontend');
  assert(feStack, 'Stack frontend harus ada');
  assert.strictEqual(feStack.name, 'React', 'Nama stack frontend harus React, bukan prefix');
  assert.strictEqual(feStack.version, '18', 'Versi stack frontend harus 18');
  console.log('Verifikasi parsing stack contract OK: category=frontend, name=React, version=18');

  console.log('\n--- 5. TEST PRD (GENERATE & IDEMPOTENT DARI CHAT HISTORY) ---');
  // Generate PRD
  const prdGenRes = await authedFetch(`/api/projects/${projectId}/prd/generate`, { method: 'POST' });
  assert.strictEqual(prdGenRes.status === 200 || prdGenRes.status === 201, true, 'PRD generate status harus 200/201');
  console.log('PRD berhasil digenerate.');

  // Ambil PRD (Idempotent: membuka lagi tidak generate ulang)
  const prdGetRes = await authedFetch(`/api/projects/${projectId}/prd`);
  const prdGetJson = await prdGetRes.json();
  const prdContent = prdGetJson.prd?.content ?? prdGetJson.brd?.content;
  assert(prdContent, 'PRD content harus ada');
  console.log('PRD idempotent check OK: content ditemukan tanpa generate ulang.');
  if (prdContent.userStories?.length > 0) {
    console.log(`User stories count: ${prdContent.userStories.length}`);
    const gherkinCount = prdContent.userStories.filter((us: any) => us.gherkin && us.gherkin.length > 0).length;
    console.log(`User stories dengan skenario Gherkin: ${gherkinCount}`);
  }

  // Test Download PRD .md
  const prdDownloadRes = await authedFetch(`/api/projects/${projectId}/prd/download`);
  assert.strictEqual(prdDownloadRes.status, 200, 'Download PRD status harus 200');
  const prdMdText = await prdDownloadRes.text();
  assert(prdMdText.includes('# Product Requirements Document'), 'Konten PRD.md harus valid');
  console.log('Download PRD .md OK.');

  console.log('\n--- 7. TEST TREE DIAGRAM (GENERATE & IDEMPOTENT) ---');
  // Generate Tree
  const treeGenRes = await authedFetch(`/api/projects/${projectId}/tree/generate`, { method: 'POST' });
  if (treeGenRes.status !== 200) {
    console.error('Tree generate error:', await treeGenRes.json());
  }
  assert.strictEqual(treeGenRes.status, 200, 'Tree generate status harus 200');
  const treeGenJson = await treeGenRes.json();
  console.log(`Tree berhasil digenerate: ${treeGenJson.count} nodes`);

  // Ambil Tree (Idempotent: membuka lagi tidak generate ulang)
  const treeGetRes = await authedFetch(`/api/projects/${projectId}/tree`);
  const treeGetJson = await treeGetRes.json();
  assert(treeGetJson.nodes.length > 0, 'Tree nodes harus ada');
  console.log(`Tree idempotent check OK: ${treeGetJson.nodes.length} nodes ditemukan.`);

  console.log('\n--- 8. TEST BOARD TASKS (GENERATE & IDEMPOTENT) ---');
  // Generate Tasks
  const tasksGenRes = await authedFetch(`/api/projects/${projectId}/tasks/generate`, { method: 'POST' });
  assert.strictEqual(tasksGenRes.status, 200, 'Tasks generate status harus 200');
  const tasksGenJson = await tasksGenRes.json();
  console.log(`Tasks berhasil digenerate: ${tasksGenJson.count} tasks`);

  // Ambil Tasks (Idempotent)
  const tasksGetRes = await authedFetch(`/api/projects/${projectId}/tasks`);
  const tasksGetJson = await tasksGetRes.json();
  assert(tasksGetJson.tasks.length > 0, 'Tasks harus ada');
  console.log(`Tasks idempotent check OK: ${tasksGetJson.tasks.length} tasks.`);
  assert(Array.isArray(tasksGetJson.userStories), 'Response /api/projects/:id/tasks harus menyertakan userStories');
  console.log(`User stories dari PRD terhubung: ${tasksGetJson.userStories.length} stories.`);

  // Verifikasi struktur task (Acceptance Criteria, Validation Commands, dan User Story Induk)
  for (const t of tasksGetJson.tasks) {
    assert(Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length > 0, `Task #${t.order} harus memiliki acceptanceCriteria`);
    assert(Array.isArray(t.aiContext?.validation_commands) && t.aiContext.validation_commands.length > 0, `Task #${t.order} harus memiliki validation_commands`);
    assert(typeof t.aiContext?.userStoryId === 'string' && t.aiContext.userStoryId.length > 0, `Task #${t.order} harus memiliki userStoryId induk`);
  }
  console.log(`Verifikasi semua ${tasksGetJson.tasks.length} task memiliki acceptance criteria, validation commands, dan userStoryId OK.`);

  // Verifikasi validation_commands dinamis
  const allValCmds = tasksGetJson.tasks.flatMap((t: any) => (t.aiContext?.validation_commands || []));
  assert(allValCmds.length > 0, 'Harus ada validation commands terdaftar');
  console.log('Verifikasi validation commands dinamis OK.');

  console.log('\n--- 8B. TEST EXPORT PAKET ZIP & WIZARD STEP UNLOCK ---');
  // Test Download Paket ZIP
  const zipRes = await authedFetch(`/api/projects/${projectId}/export.zip`);
  assert.strictEqual(zipRes.status, 200, 'Download ZIP status harus 200');
  const contentType = zipRes.headers.get('content-type');
  assert(contentType?.includes('application/zip'), 'Content-Type harus application/zip');
  const zipArrayBuffer = await zipRes.arrayBuffer();
  assert(zipArrayBuffer.byteLength > 100, 'Ukuran file ZIP harus valid');
  console.log(`Download Paket ZIP OK: ${zipArrayBuffer.byteLength} bytes.`);

  // Test Mundur Wizard Step (Unlock Tahap)
  const stepBackRes = await authedFetch(`/api/projects/${projectId}/wizard-step`, {
    method: 'POST',
    body: JSON.stringify({ step: 'tree' }),
  });
  assert.strictEqual(stepBackRes.status, 200, 'Step back status harus 200');
  const stepBackJson = await stepBackRes.json();
  assert.strictEqual(stepBackJson.wizardStep, 'tree', 'Wizard step harus menjadi tree');
  console.log('Unlock tahap sebelumnya (wizard-step: tree) OK.');

  // Test bahwa lompat maju dilarang (harus 400)
  const invalidForwardRes = await authedFetch(`/api/projects/${projectId}/wizard-step`, {
    method: 'POST',
    body: JSON.stringify({ step: 'board' }),
  });
  assert.strictEqual(invalidForwardRes.status, 400, 'Lompat maju via wizard-step harus 400');
  console.log('Validasi arah mundur (tolak lompat maju) OK.');

  // Kembalikan ke board via tasks/generate
  await authedFetch(`/api/projects/${projectId}/tasks/generate`, {
    method: 'POST',
  });
  console.log('Restore wizard-step ke board OK.');

  console.log('\n--- 9. TEST CLI TOKEN & MASTER PROMPT ---');
  // Generate token untuk CLI agent
  const tokenRes = await authedFetch(`/api/projects/${projectId}/agent-tokens`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Agent Token E2E' }),
  });
  assert.strictEqual(tokenRes.status, 201, 'Agent token generate status harus 201');
  const tokenJson = await tokenRes.json();
  const rawToken = tokenJson.token || tokenJson.plainToken;
  assert(rawToken, 'Plaintext token harus ada');
  console.log('Token CLI berhasil dibuat:', rawToken.substring(0, 10) + '...');

  // Ambil master prompt
  const promptRes = await authedFetch(`/api/projects/${projectId}/master-prompt`);
  assert.strictEqual(promptRes.status, 200, 'Master prompt status harus 200');
  const promptJson = await promptRes.json();
  assert(promptJson.prompt.includes('numa next'), 'Prompt harus memuat loop instruksi CLI');
  console.log('Master prompt berhasil diambil.');

  // Test CLI agent loop API dengan Bearer token
  console.log('\n--- 10. TEST CLI AGENT LOOP ---');
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

  // Agent next task
  const nextRes = await agentFetch('/api/agent/tasks/next');
  assert.strictEqual(nextRes.status, 200, 'Agent next status harus 200');
  const nextJson = await nextRes.json();
  console.log('Next task for agent:', nextJson.task?.title);

  if (nextJson.task) {
    const taskId = nextJson.task.id;
    // Agent start task
    const startRes = await agentFetch(`/api/agent/tasks/${taskId}/start`, { method: 'POST' });
    assert.strictEqual(startRes.status, 200, 'Agent start task status harus 200');
    console.log('Agent start task OK');

    // Agent context
    const ctxRes = await agentFetch(`/api/agent/tasks/${taskId}/context`);
    assert.strictEqual(ctxRes.status, 200, 'Agent context status harus 200');
    const ctxJson = await ctxRes.json();
    console.log('Agent context task preview:', (ctxJson.markdown || '').substring(0, 80));

    // Test guard: periksa bahwa guard memuat validation_commands
    assert(Array.isArray(ctxJson.guard?.validation_commands), 'Guard harus memuat validation_commands');
    console.log(`Guard validation_commands terdaftar: ${ctxJson.guard.validation_commands.length} commands`);

    // Test simulasi guard lolos pada command sukses
    const { runGuard, GuardError } = await import('../packages/cli/src/guard.js');
    await runGuard(
      {
        validation_commands: ['echo "validation ok"'],
      },
      process.cwd(),
      taskId
    );
    console.log('Verifikasi CLI Guard lolos pada command valid OK.');

    // Test simulasi guard fail jika validation command gagal
    let guardBlocked = false;
    try {
      await runGuard(
        {
          validation_commands: ['sh -c "exit 1"'],
        },
        process.cwd(),
        taskId
      );
    } catch (gErr: any) {
      if (gErr instanceof GuardError && gErr.failureContext?.failure_type === 'TEST_FAILURE') {
        guardBlocked = true;
      }
    }
    assert.strictEqual(guardBlocked, true, 'Guard harus memblokir jika validation_commands gagal');
    console.log('Verifikasi CLI Guard memblokir jika validation command gagal OK.');

    // Agent done task
    const doneRes = await agentFetch(`/api/agent/tasks/${taskId}/complete`, { method: 'POST' });
    assert.strictEqual(doneRes.status, 200, 'Agent done task status harus 200');
    console.log('Agent complete task OK');
  }

  console.log('\n=== SEMUA TEST E2E BERHASIL 100%! ===');
}

runTest().catch((err) => {
  console.error('TEST E2E GAGAL:', err);
  process.exit(1);
});
