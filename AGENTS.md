# AGENTS.md — numa

## Apa Itu Numa

Numa adalah **AI Software Factory** — platform SaaS yang mengubah ide aplikasi menjadi project siap eksekusi secara otomatis. User mendeskripsikan ide, lalu AI memandu melalui wizard bertahap: wawancara kebutuhan, pemilihan tech stack, pembuatan dokumen produk (PRD), perancangan arsitektur, dan pemecahan menjadi atomic tasks. Hasil akhirnya: task-task granular dengan bounded context ketat yang dieksekusi oleh AI coding agent di komputer user via CLI `numa`.

**Target pengguna**: developer yang ingin mempercepat fase planning dan bootstrapping project baru menggunakan AI.

**Masalah yang diselesaikan**: gap antara ide mentah dan kode — biasanya butuh manual planning, PRD writing, task breakdown. Numa mengotomasi seluruh pipeline ini.

## Alur Wizard & Keluarga Fitur Numa

Setiap project melewati 8 tahap berurutan di bawah keluarga fitur Numa (lihat panduan lengkap di [BRAND.md](docs/BRAND.md)). Tahap yang sudah dilewati terkunci read-only (HTTP 403 via `isStageLocked`).

| # | Fitur | Tahap | Halaman | Fungsi |
|---|-------|-------|---------|--------|
| 1 | Numa Brief | `chat` | `/chat/:sessionId` | Brainstorming ide awal dengan AI. |
| 2 | Numa Brief | `interview` | `/projects/:id/interview` | AI generate pertanyaan discovery. User jawab atau pakai rekomendasi AI. |
| 3 | Numa Blueprint | `techstack` | `/projects/:id/techstack` | Rekomendasi AI (default, langsung lanjut) atau pilih manual per kategori. |
| 4 | Numa Blueprint | `prd` | `/projects/:id/prd` | AI generate PRD terstruktur (functional requirements, product rules, constraints). |
| 5 | Numa Flow | `tree` | `/projects/:id/tree` | AI generate hierarki dekomposisi aplikasi (App -> Fitur -> Sub-fitur). |
| 6 | Numa Forge | `board` | `/projects/:id/board` | AI generate atomic tasks dengan bounded context. Kanban board. |
| 7 | Numa Agent | `guide` | `/projects/:id/guide` | Generate Master Prompt + PAT token. User copy ke AI coding agent. |
| 8 | Numa Agent | `done` | - | AI coding agent eksekusi via CLI `numa next/start/context/done`. |

## Arsitektur AI Engine (`apps/api/src/lib/ai/`)

| Module | Fungsi |
|--------|--------|
| `ai-service.ts` | Client OpenAI SDK. Auto-retry Zod, logging token/latensi ke `AiCallLog`, model routing (`reasoning` vs `cheap`). |
| `chat.ts` | Orchestrator chat onboarding: reply, finalize, generate interview, recommend answer/techstack, generate tree. |
| `discovery.ts` | Generator pertanyaan kuesioner kebutuhan. |
| `job.ts` | Async AI job runner: fire-and-forget via `startAiJob`, state machine `running/done/failed`, auto-fail stale job >10 menit. |
| `prd.ts` | Generator PRD terstruktur dari hasil wawancara. |
| `roadmap.ts` | Generator pembagian fase dan fitur dari PRD. |
| `tasks.ts` | Generator atomic tasks dari roadmap dengan bounded context (`files_to_create`, `files_to_modify`, `forbidden`, `validation_commands`). |
| `ui-spec.ts` | Generator kontrak desain UI/UX dari PRD (layout, components, tokens, states). |
| `dag-validator.ts` | Validasi DAG task: deteksi siklus, hapus invalid dependency, topological sort. |
| `schemas.ts` | Kontrak data Zod untuk semua interaksi AI. |
| `prompts.ts` | Katalog system prompt. |

## Shared Lib (`apps/api/src/lib/`)

| Module | Fungsi |
|--------|--------|
| `stage.ts` | Konstanta `STAGE_ORDER`, helper `isStageLocked`, `furthestStage`. |
| `markdown-export.ts` | Builder markdown untuk ekspor PRD dan tasks. |
| `task-persist.ts` | `persistGeneratedTasks` — simpan hasil AI ke DB (dipakai oleh routes/tasks dan routes/cycles). |

## Model Data Utama (Prisma)

| Model | Fungsi |
|-------|--------|
| `User`, `Session`, `Account` | Autentikasi (Better Auth). |
| `Project` | Entitas root: nama, deskripsi, ide mentah, `wizardStep`, `uiSpec` JSON. |
| `Stack` | Tech stack per kategori (frontend, backend, database, deployment). |
| `DiscoveryQuestion`, `DiscoveryAnswer` | Pertanyaan dan jawaban fase interview. |
| `Prd` | Dokumen kebutuhan produk JSON + versioning. |
| `RoadmapPhase`, `RoadmapFeature`, `RoadmapDependency` | Graph rencana pengembangan. |
| `Task`, `TaskDependency` | Atomic task: bounded context JSON, acceptance criteria, layer, relasi DAG. |
| `TreeNode` | Hierarki dekomposisi project. |
| `Checkpoint` | Gate review antar layer arsitektur (human-in-the-loop). |
| `AgentToken`, `AgentTokenScope` | PAT token CLI (hash sha256, multi-project scope). |
| `AgentSession` | Tracking sesi kerja agent. |
| `AiCallLog` | Observabilitas: model, tokens, latensi, retry, success. |

## Struktur Monorepo

```
.
├── apps/
│   ├── api/          # Express + Prisma + Zod + Better Auth (port 6655)
│   │   ├── prisma/   # schema.prisma + migrations + seed.ts
│   │   └── src/
│   │       ├── index.ts              # bootstrap slim (~180 baris), mount 19 router
│   │       ├── routes/               # 19 domain router (health, projects, agent, tasks, cycles, survey, dll.)
│   │       ├── lib/{prisma,auth,stage,markdown-export,task-persist}.ts
│   │       ├── lib/ai/{ai-service,chat,job,discovery,prd,roadmap,tasks,...}.ts
│   │       ├── middleware/{require-user,require-agent,require-agent-simple}.ts
│   │       └── tools/registry.ts
│   └── web/          # Vite + React + Tailwind + shadcn (port 3455)
│       └── src/
│           ├── main.tsx, App.tsx
│           ├── components/{ui,layout,chat,wizard,kanban,tree,cycle,execution,billing}/
│           ├── hooks/{use-project-tasks,use-tree-pan-zoom,...}.ts
│           ├── lib/{utils,http,auth-client,ai-job,tree-layout,constants}.ts
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
- **Akses publik**: tunnel Cloudflare di `https://numa.mrijal.my.id` (ingress `/api/*` -> 6655, sisanya -> 3455).
- **CLI remote**: `npm i -g numa-cli`, set `NUMA_API_URL`.
- **Route** dikelompokkan per domain di `apps/api/src/routes/*.ts` (19 router). `index.ts` hanya bootstrap + mount. Pakai `requireUser` (cookie) atau `requireAgent` (PAT). Validasi body dengan Zod.
- **AI async**: semua pemanggilan AI berat (generate tasks, tree, techstack, survey) via fire-and-forget `startAiJob`. Status disimpan di tabel `AiJob`, frontend polling via `pollAiJob()` (interval 3s, max 60 attempts). PRD tetap SSE synchronous dengan heartbeat 15s.
- **Tool registry**: edit `apps/api/src/tools/registry.ts`, otomatis muncul di dashboard via `/api/tools`.

## CLI Commands (`numa`)

| Command | Fungsi |
|---------|--------|
| `login <token>` | Simpan PAT, tes koneksi, baca project scope. |
| `switch [projectId]` | Ganti project aktif tanpa login ulang. |
| `whoami` | Identitas token dan project aktif. |
| `next` | Ambil task berikutnya (atau resume `IN_PROGRESS`). |
| `start [id]` | Tandai task `IN_PROGRESS`. |
| `context [id]` | Cetak Markdown bounded context (file boleh/larang, AC, DoD). |
| `done [id]` | Tandai selesai + jalankan guard verifikasi file + `validation_commands`. Flag: `--force`, `--dir`. |
| `prd` | Cetak PRD project dalam format Markdown. |
| `status` | Diagnostik server, token, task aktif, project. |
| `logout` | Hapus token lokal. |


<!-- REFIRA:START -->
### Refira UI Prototypes
All prototype pages are located in `.refira/pages/`. When creating or editing prototypes, strictly adhere to [.refira/RULES.md](.refira/RULES.md) and activate skill `refira` (`.agents/skills/refira/SKILL.md`).
<!-- REFIRA:END -->
