# AGENTS.md — numa

## Apa Itu Numa

Numa adalah **AI Software Factory** — platform SaaS yang mengubah ide aplikasi menjadi project siap eksekusi secara otomatis. User mendeskripsikan ide, lalu AI memandu melalui wizard bertahap: wawancara kebutuhan, pemilihan tech stack, pembuatan dokumen produk (PRD), perancangan arsitektur, dan pemecahan menjadi atomic tasks. Hasil akhirnya: task-task granular dengan bounded context ketat yang dieksekusi oleh AI coding agent di komputer user via CLI `numa`.

**Target pengguna**: developer yang ingin mempercepat fase planning dan bootstrapping project baru menggunakan AI.

**Masalah yang diselesaikan**: gap antara ide mentah dan kode — biasanya butuh manual planning, PRD writing, task breakdown. Numa mengotomasi seluruh pipeline ini.

## Alur Wizard & Keluarga Fitur Numa

Setiap project melewati 7 tahap berurutan di bawah keluarga fitur Numa (lihat panduan lengkap di [BRAND.md](docs/BRAND.md)). Tahap yang sudah dilewati terkunci read-only (HTTP 403 via `isStageLocked`).

| # | Fitur | Tahap | Halaman | Fungsi |
|---|-------|-------|---------|--------|
| 1 | Numa Brief | `chat` | `/chat` | Input ide awal. Satu request `POST /api/chat/finalize` membuat project (tanpa panggilan AI); nama aplikasi dihasilkan survey putaran 1. |
| 2 | Numa Brief | `interview` | `/projects/:id/interview` | AI generate pertanyaan survey per putaran (jumlah putaran sesuai paket). Putaran 1 dimulai dari proses existing (cara kerja sebelum ada aplikasi), lalu fitur, aturan bisnis, dan batasan. User jawab atau pakai saran Numa. Ringkasan survey memuat bagian Proses Saat Ini (As-Is). |
| 3 | Numa Blueprint | `techstack` | `/projects/:id/techstack` | Rekomendasi AI (default) atau pilih Golden Stack manual. Rekomendasi di-prefetch begitu ringkasan survey selesai (bukan paket Free); hasil beserta alasannya ditampilkan untuk dikonfirmasi user sebelum disimpan dan lanjut ke PRD. |
| 4 | Numa Blueprint | `prd` | `/projects/:id/prd` | AI generate PRD terstruktur (functional requirements, product rules, constraints, edge case). Generate lewat antrean job `prd_generate` (teks tersusun terbaca bertahap lewat polling 1,5 dtk); setelah PRD tersimpan, spec (journey utama dan gagal, entitas, endpoint) disusun di background oleh job `prd_spec` dan menjadi skenario E2E task. Pembuatan task menunggu job spec bila masih berjalan. |
| 5 | Numa Forge | `board` | `/projects/:id/board` | AI generate atomic tasks dengan bounded context. Kanban board. Job `tasks_generate`: spec PRD, roadmap (bila belum ada), task per fase secara paralel, quality gate, simpan; langkah berjalan terbaca lewat polling dan ditampilkan di Board. Audit keamanan AI berjalan di background (`security_audit`) dan hanya menambah temuan ke laporan validasi. |
| 6 | Numa Agent | `guide` | `/projects/:id/guide` | Generate Master Prompt + PAT token. User copy ke AI coding agent. |
| 7 | Numa Agent | `done` | - | AI coding agent eksekusi via CLI `numa next/start/context/done`. |

## Arsitektur AI Engine (`apps/api/src/lib/ai/`)

| Module | Fungsi |
|--------|--------|
| `ai-service.ts` | Client OpenAI SDK. Auto-retry Zod, logging token/latensi ke `AiCallLog`, model routing (`reasoning` vs `cheap`), `reasoning_effort` opsional lewat `OPENAI_REASONING_EFFORT_CHEAP|REASONING`. |
| `chat.ts` | `finalizeChatSession` (buat session + project dalam satu transaksi, tanpa AI), `draftProjectName`, `buildTechStackInput` + `recommendTechStack` (tier cheap; input = ringkasan survey + ide), generate flow (legacy, backend saja). |
| `job.ts` | Async AI job runner: fire-and-forget via `startAiJob`, state machine `running/done/failed`, auto-fail stale job >10 menit. `enqueueAiJobOnce` idempoten untuk `survey_round`/`survey_summary`/`techstack_recommend`/`prd_generate`/`prd_spec`/`tasks_generate`/`security_audit` (partial unique index `AiJob_idempotent_active_key`: satu job aktif per project+type). |
| `prd.ts` | Generator PRD markdown (stream) dari hasil wawancara, `buildChatHistory` (riwayat chat dibuang bila hanya berisi ide awal), `readPrdContent`. |
| `roadmap.ts` | Generator pembagian fase dan fitur: input spec PRD ringkas (`buildRoadmapInput`, markdown hanya bila spec tidak ada), tier cheap, mengikuti stack terpilih. Disimpan atomik lewat `lib/roadmap-store.ts`. |
| `tasks.ts` | Generator atomic tasks dengan bounded context (`files_to_create`, `files_to_modify`, `forbidden`, `validation_commands`). `generateTasksByPhase`: satu panggilan per fase roadmap secara paralel (maks 5), tier cheap, prompt per fase (`PhaseScope`), diulang sekali untuk fase yang gagal; `generateTasksFromRoadmap`: satu panggilan penuh (change cycle). |
| `task-merge.ts` | `mergePhaseTasks`: nomor global TASK-NNN, pemetaan depends_on lokal dan featureId, dependensi lintas fitur dari roadmap; `mapWithConcurrency`. |
| `security-baseline.ts` | `applySecurityBaseline`: kriteria keamanan baseline (prefiks "Keamanan:") disuntikkan deterministik per layer dan endpoint tanpa AI. |
| `cycle.ts` | Analisis change request dan merge delta PRD untuk change cycle. |
| `security-audit.ts` | Audit keamanan AI (tier reasoning) berjalan di background lewat job `security_audit`; hanya menghasilkan temuan untuk laporan validasi, tidak mengubah task. |
| `product-spec.ts`, `golden-stack.ts`, `stack-contract.ts`, `architecture-contract.ts`, `journey-contract.ts`, `flow-contract.ts` (legacy) | Kontrak produk, golden stack, stack, arsitektur, dan alur yang menjadi acuan prompt dan validator. `journey-contract.ts` menyusun skenario E2E (jalur utama dan jalur gagal bercabang lewat `branchFrom`) dari `ProductSpec.journeys`, menyuntiknya ke task INTEGRATION, dan memeriksa cakupan requirement per journey (warning `JOURNEY_REQ_UNCOVERED`). `flow-contract.ts` dipakai hanya bila project masih punya `BusinessFlow` (akan dihapus, lihat `docs/JOURNEY_MIGRATION_PLAN.md`). |
| `api-coverage-validator.ts`, `cleanup-validator.ts`, `validation-report.ts` | Validator hasil generate tasks dan laporan validasi. |
| `usage.ts` | Pencatatan dan taksiran token per panggilan AI, termasuk `reasoningTokens` (`AiCallLog.reasoningTokens`). |
| `dag-validator.ts` | Validasi DAG task: deteksi siklus, hapus invalid dependency, topological sort. |
| `schemas.ts` | Kontrak data Zod untuk semua interaksi AI. |
| `../survey.ts` | Generator pertanyaan survey per putaran dan ringkasan survey (`generateSurveyRound`, `generateSurveySummary`). Tema putaran 1: Proses Saat Ini & Masalah Utama; putaran 1 juga memberi `appName`. Putaran memakai tier `cheap`, ringkasan tetap `reasoning`. |
| `prompts.ts` | Katalog system prompt bersama dan `PROMPT_VERSIONS` (versi prompt semua tahap, dicatat di `AiCallLog.promptVersion`; naikkan versi saat isi prompt berubah). Versi saat ini: tech-stack@3, prd@3, tasks@4, flow@2, roadmap@2, cycle@1, product-spec@3, security-audit@2, survey-round@4, survey-summary@2. |

## Shared Lib (`apps/api/src/lib/`)

| Module | Fungsi |
|--------|--------|
| `stage.ts` | Konstanta `STAGE_ORDER`, helper `isStageLocked`, `furthestStage`. |
| `markdown-export.ts` | Builder markdown untuk ekspor PRD dan tasks. |
| `survey-store.ts` | Penyimpanan survey: `resolveTotalRounds` (putaran dikunci di `Project.surveyTotalRounds` saat survey dimulai), `saveRoundAnswers` (upsert atomik, tolak pertanyaan di luar project/putaran), `saveRoundQuestions` (`createMany skipDuplicates`). |
| `techstack-store.ts` | `saveTechStack`: ganti stack project dan majukan wizard ke `prd` dalam satu transaksi dengan `FOR UPDATE` pada baris Project (aman terhadap request bersamaan). |
| `prd-store.ts` | `savePrd` (upsert PRD + `wizardStep` board dalam satu transaksi, snapshot versi lama best-effort), `applyProductSpec` (spec hanya menempel pada versi PRD yang diekstrak). `prd-spec.ts`: `ensureProductSpec` menunggu job `prd_spec` yang aktif. |
| `task-persist.ts` | `persistGeneratedTasks` — simpan hasil AI ke DB (dipakai oleh routes/tasks dan routes/cycles). |
| `task-context.ts` | Penyusun konteks per task untuk `numa context`: detail requirement/edge case/journey, filter endpoint dan model data, file nyata dari laporan guard, ringkasan kontrak arsitektur. Fungsi murni. |
| `access.ts` | RBAC org: `projectWhere`, `getProjectRole`, `hasRole`, `agentProjectWhere`. Wajib dipakai untuk query project (jangan `{ id, userId }`). |
| `audit.ts` | `recordAudit` — jejak aksi sensitif ke `AuditLog` (tidak pernah melempar error). |
| `ai-budget.ts` | Budget token AI bulanan per pemilik tagihan; `assertAiBudget` dipanggil di ai-service. |
| `artifact-version.ts` | `snapshotArtifact` — snapshot PRD/business flow sebelum ditimpa. |
| `account-data.ts` | Ekspor dan penghapusan data akun. |
| `logger.ts` | Logger terstruktur (JSON di produksi) + request id lewat `middleware/request-context.ts`. Dilarang memakai `console.*` di API. |
| `http-error.ts` | `HttpError` dan `toClientError`: pemetaan error ke respons klien (tanpa bocor detail internal di produksi). |
| `mayar.ts` | Klien Mayar.id API V2 (`createPaymentRequest`, `getTransaction`), `getMayarConfig`, `verifyWebhookToken`, klasifikasi status. Dipakai `routes/billing.ts`. |
| `env.ts`, `env-check.ts` | Validasi env saat startup (gagal cepat bila env wajib hilang). |
| `request-schemas.ts` | Skema Zod body request yang dipakai lintas route. |
| `pricing.ts` | Harga token per tier (`AI_PRICE_*`, rupiah per 1 juta token) dan `estimateCost`. |
| `platform-admin.ts` | `isPlatformAdmin` berdasarkan `PLATFORM_ADMIN_EMAILS`; middleware `require-platform-admin.ts` (non-admin dapat 404). |
| `admin-usage.ts` | Agregasi pemakaian AI (ringkasan, deret waktu, per tahap, per user, per paket) untuk dashboard admin `/admin/usage`. |

## Model Data Utama (Prisma)

| Model | Fungsi |
|-------|--------|
| `User`, `Session`, `Account` | Autentikasi (Better Auth). |
| `Project` | Entitas root: nama, deskripsi, ide mentah, `wizardStep`, `uiSpec` JSON. |
| `Stack` | Tech stack per kategori (frontend, backend, database, deployment). |
| `DiscoveryQuestion`, `DiscoveryAnswer` | Pertanyaan dan jawaban fase interview. Unique `(projectId, round, order)` dan `(questionId)`. |
| `Prd` | Dokumen kebutuhan produk JSON + versioning. |
| `RoadmapPhase`, `RoadmapFeature`, `RoadmapDependency` | Graph rencana pengembangan. |
| `Task`, `TaskDependency` | Atomic task: bounded context JSON, acceptance criteria, layer, relasi DAG. |
| `TreeNode`, `BusinessFlow` | Legacy: tidak lagi digenerate di wizard (tree dihapus, flow hanya via API backend). Tabel dibuang di langkah akhir `docs/JOURNEY_MIGRATION_PLAN.md`. |
| `Checkpoint` | Gate review antar layer arsitektur (human-in-the-loop). |
| `AgentToken`, `AgentTokenScope` | PAT token CLI (hash sha256, multi-project scope). |
| `AgentSession` | Tracking sesi kerja agent. |
| `AiCallLog` | Observabilitas: model, tokens, latensi, retry, success; `userId`/`orgId` untuk budget per tenant. |
| `Organization`, `Membership` | Tenant dan peran (viewer < member < admin < owner). `Project.orgId` null = project pribadi. |
| `AuditLog` | Jejak aksi sensitif (tanpa FK). |
| `AiJob` | Antrean job AI tahan restart (queued/running/done/failed/cancelled). |
| `ArtifactVersion` | Snapshot versi lama PRD dan business flow. |
| `Subscription`, `Payment` | Paket langganan per user dan riwayat pembayaran. `Payment` netral gateway (`provider`, `providerRef`, `providerTxId`, `checkoutUrl`, `expiresAt`). |

## Struktur Monorepo

```
.
├── apps/
│   ├── api/          # Express + Prisma + Zod + Better Auth (port 6655)
│   │   ├── prisma/   # schema.prisma + migrations + seed.ts
│   │   └── src/
│   │       ├── app.ts                # createApp(): middleware + mount 19 router (tanpa listen, dipakai tes supertest)
│   │       ├── index.ts              # bootstrap: env, listen, worker antrean, shutdown rapi
│   │       ├── routes/               # 19 domain router (health, projects, agent, tasks, cycles, survey, dll.)
│   │       ├── lib/{prisma,auth,stage,markdown-export,task-persist,task-context}.ts
│   │       ├── lib/ai/{ai-service,chat,job,prd,roadmap,tasks,...}.ts
│   │       ├── middleware/{require-user,require-agent,require-agent-simple}.ts
│   │       └── tools/registry.ts
│   └── web/          # Vite + React + Tailwind + shadcn (port 3455)
│       └── src/
│           ├── main.tsx, App.tsx
│           ├── components/{ui,layout,chat,wizard,prd,kanban,cycle,execution,billing}/
│           ├── hooks/{use-project-tasks,use-prd-generation,...}.ts
│           ├── lib/{utils,http,auth-client,ai-job,constants}.ts
│           └── pages/{login,home,profile,chat,projects/*}.tsx
├── packages/cli/     # numa (commander)
│   └── src/
│       ├── index.ts                   # commander registration (~114 baris)
│       ├── commands/{basic,done,init,sync}.ts
│       ├── {config,api-client,guard,format-prd}.ts
└── scripts/          # test-e2e-wizard.ts (E2E integration test)
```

## Aturan Penting

- **Port**: 3455 (web), 6655 (api). Runtime via Docker Compose (`docker compose up -d --build`).
- **Bahasa**: semua string UI, komentar publik, komunikasi ke user dalam **Bahasa Indonesia**.
- **Tanpa emoji** di UI/kode/komunikasi. Pakai `lucide-react` icons.
- **Tanpa mock fallback** di CLI/API. Error AI harus eksplisit (HTTP 502 + pesan).
- **PAT**: disimpan sebagai `sha256` di DB. Plaintext dikembalikan SEKALI saat generate.
- **Isolasi project**: `requireAgent` middleware attach `projectId`. Agent hanya akses task project sendiri.
- **Akses publik**: tunnel Cloudflare di `https://numa.opendv.xyz` (ingress `/api/*` -> 6655, sisanya -> 3455).
- **CLI remote**: `npm i -g numa-cli`, set `NUMA_API_URL`.
- **Route** dikelompokkan per domain di `apps/api/src/routes/*.ts` (19 router). `app.ts` hanya merakit middleware + mount, `index.ts` hanya bootstrap. Pakai `requireUser` (cookie) atau `requireAgent` (PAT). Validasi body dengan Zod.
- **AI async**: semua pemanggilan AI berat (generate tasks, techstack, survey) lewat antrean `enqueueAiJob` + handler `registerJobHandler` (`lib/ai/job.ts`). Worker mengklaim job secara atomik, heartbeat, retry, dan tahan restart. Frontend polling via `pollAiJob()` (default interval 3s, max 120 attempts atau 6 menit; halaman survey memakai 1,5s dan 240 attempts). Generate PRD juga lewat antrean (`prd_generate`): handler menulis teks sementara ke `AiJob.result` (`reportJobProgress`) yang dibaca halaman PRD lewat polling; tidak ada lagi SSE.
- **Multi-tenant**: akses project selalu lewat `projectWhere` dan guard `requireProjectRole` (GET viewer, mutasi member, DELETE admin). Aksi sensitif dicatat dengan `recordAudit`.
- **Env baru**: `TRUST_PROXY_HOPS`, `PLATFORM_ADMIN_EMAILS`, `AI_PRICE_INPUT_PER_MTOK_REASONING|CHEAP`, `AI_PRICE_OUTPUT_PER_MTOK_REASONING|CHEAP`, `AI_JOB_CONCURRENCY`, `AI_MAX_ACTIVE_JOBS_PER_USER`, `AI_TOKEN_BUDGET_FREE|STARTER|PRO`, `OPENAI_REASONING_EFFORT_CHEAP|REASONING`, `LOG_LEVEL`, `LOG_FORMAT`, `OIDC_*` (lihat `.env.example`).
- **Pembayaran (Mayar.id)**: `routes/billing.ts` memakai Mayar API V2 (V1 sudah deprecated). Env: `MAYAR_API_KEY`, `MAYAR_WEBHOOK_TOKEN` (dicocokkan dengan header `X-Callback-Token`), `MAYAR_IS_PRODUCTION` (true = api.mayar.id, selain itu sandbox api.mayar.io). Webhook tidak memercayai payload: status dan nominal selalu dikonfirmasi ke `GET /transactions/{id}`; `POST /api/billing/payments/:id/sync` merekonsiliasi saat user kembali dari halaman bayar. Tanpa key, checkout dan webhook menjawab 503. URL webhook didaftarkan di dashboard Mayar: `<domain>/api/billing/webhook`. Rencana dan hasil riset: `docs/MAYAR_MIGRATION_PLAN.md`.
- **Health**: `/health` (liveness) dan `/ready` (database + worker antrean; 503 bila gagal), dipakai healthcheck produksi.
- **Admin**: endpoint `/api/admin/usage/*` hanya untuk email di `PLATFORM_ADMIN_EMAILS`; halaman web `/admin/usage`.
- **Build API**: produksi menjalankan `node dist/index.js` (tsc), impor relatif wajib berekstensi `.js`. Dev memakai `tsx watch`.
- **Kualitas**: `npm run lint` (ESLint, API dilarang `console.*`) dan `npm run deadcode` (knip) harus bersih. Test route HTTP memakai supertest lewat `createApp()` (`routes/__tests__/http.test.ts`, tanpa database).
- **CI**: `.github/workflows/ci.yml` (audit dependensi produksi, lint, dead code, typecheck, build API, test) wajib lulus sebelum deploy. Image di-tag commit SHA.
- **Tool registry**: edit `apps/api/src/tools/registry.ts`, otomatis muncul di dashboard via `/api/tools`.

## CLI Commands (`numa`)

| Command | Fungsi |
|---------|--------|
| `login [token]` | Simpan PAT (prompt tersembunyi / `NUMA_TOKEN`), tes koneksi, baca project scope. |
| `switch [projectId]` | Ganti project aktif tanpa login ulang. |
| `whoami` | Identitas token dan project aktif. |
| `next` | Ambil task berikutnya (atau resume `IN_PROGRESS`). |
| `start [id]` | Tandai task `IN_PROGRESS`. |
| `context [id]` | Cetak Markdown bounded context (file boleh/larang, AC, DoD). |
| `done [id]` | Tandai selesai + jalankan guard verifikasi file + `validation_commands`. Flag: `--force`, `--dir`. |
| `prd` | Cetak PRD project dalam format Markdown. |
| `status` | Diagnostik server, token, task aktif, project, versi skill pack. |
| `init [--update] [--target]` | Pasang skill pack ke `.agents/skills/` (+ salinan `.claude/skills/`), blok Numa di `AGENTS.md`, `CLAUDE.md` berisi `@AGENTS.md`. Logika di `packages/cli/src/skill-pack.ts`; sumber skill di `packages/cli/skills/`. Ubah isi skill = naikkan versi CLI. |
| `retry [id]` | Reset task BLOCKED/IN_PROGRESS ke TODO. |
| `block [id] --reason` | Tandai task BLOCKED dengan alasan. |
| `checkpoint` | Daftar checkpoint yang menunggu approval user. |
| `logout` | Hapus token lokal. |


<!-- REFIRA:START -->
### Refira UI Prototypes
All prototype pages are located in `.refira/pages/`. When creating or editing prototypes, strictly adhere to [.refira/RULES.md](.refira/RULES.md) and activate skill `refira` (`.agents/skills/refira/SKILL.md`).
<!-- REFIRA:END -->
