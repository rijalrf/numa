# Numa — AI Software Factory

> Shape ideas into software.

Workspace perencanaan dan eksekusi software yang mengubah ide produk menjadi arsitektur terstruktur dan task atomic yang siap dieksekusi oleh AI coding agent di terminal lokal. Panduan brand, design tokens, dan sistem penamaan fitur tersedia di [BRAND.md](BRAND.md). Panduan CLI lengkap di [CLI.md](CLI.md).

Pipeline: **Numa Brief** (Chat & Survey) -> **Numa Blueprint** (Tech Stack & PRD) -> **Numa Flow** (Tree & Roadmap) -> **Numa Forge** (Kanban Tasks) -> **Numa Agent** (CLI Runner & Change Cycle).

## Daftar Fitur

### 1. Numa Brief — Brainstorming & Discovery

- **Chat onboarding** (`/chat/:sessionId`) — brainstorming ide awal dengan AI. Mendukung kirim pesan, `finalize` untuk mengunci ide, dan `retry` bila hasil AI belum tepat.
- **Survey kebutuhan** (`/projects/:id/survey`) — AI generate pertanyaan discovery, user menjawab sendiri atau memakai rekomendasi AI. Jumlah putaran survey mengikuti paket langganan. Route lama `/interview` tetap diarahkan ke halaman ini.
- **Change Cycle** (`/projects/:id/board` sidebar) — setelah semua task selesai, user bisa mengajukan permintaan perubahan. Sistem membuat siklus baru (`ProjectCycle`: DRAFT/OPEN/DONE) berisi diff PRD, klarifikasi, dampak, lalu generate task siklus tersebut. Guard: semua task wajib DONE dan tidak boleh ada siklus aktif. Permintaan panjang bisa dipecah menjadi dua bagian (split `a`/`b`).

### 2. Numa Blueprint — Tech Stack & Dokumen

- **Golden Stack** — 4 paket teknologi terstandarisasi dengan kontrak arsitektur ketat:
  | Paket | Komposisi | Opsi Database |
  |---|---|---|
  | React + Express | React 18, Express, Prisma | SQLite / PostgreSQL / MySQL / Supabase |
  | Vue + NestJS | Vue 3, NestJS, Prisma | SQLite / PostgreSQL / MySQL / Supabase |
  | Next.js Fullstack | App Router, Server Actions, Prisma | SQLite / PostgreSQL / MySQL / Supabase |
  | Laravel PHP | Laravel, Blade/Tailwind, Eloquent | MySQL / PostgreSQL / SQLite |
- **Rekomendasi AI** (`/projects/:id/techstack`) — rekomendasi otomatis (default, langsung lanjut) atau pilih manual per kategori. Validasi `validateGoldenSelection` menolak kombinasi di luar kontrak (mis. MongoDB, Drizzle, TypeORM).
- **PRD / BRD** (`/projects/:id/prd`) — AI generate dokumen kebutuhan terstruktur (functional requirements, product rules, constraints) dengan versioning. Mendukung unduh Markdown dan stream SSE saat generate.

### 3. Numa Flow — Dekomposisi & Roadmap

- **Tree** (`/projects/:id/tree`) — AI generate hierarki dekomposisi aplikasi (App -> Fitur -> Sub-fitur).
- **Roadmap** — diagram DAG fase & fitur (xyflow + dagre) lengkap dengan dependency antar fitur.

### 4. Numa Forge — Atomic Tasks

- **Kanban board** (`/projects/:id/board`) — AI generate atomic tasks dengan bounded context ketat: `files_to_create`, `files_to_modify`, `forbidden`, `validation_commands`, acceptance criteria, layer, dan relasi DAG antar task. Polling otomatis 3 detik.
- **Validator pasca-generate** (heuristik non-AI + AI):
  - `dag-validator` — deteksi siklus, hapus dependency invalid, topological sort.
  - `cleanup-validator` — deteksi duplikasi file, task oversized, task tanpa validation commands.
  - `api-coverage-validator` — setiap endpoint mutasi backend wajib punya task consumer frontend.
  - `security-audit` — audit AppSec pra-implementasi, kriteria keamanan disuntikkan ke task.
  - `essential-files-validator` — kelulusan task dinilai dari Acceptance Criteria + Validation Commands multi-stack.

### 5. Numa Agent — Eksekusi via CLI

- **Master Prompt** (`/api/projects/:id/master-prompt`) — template prompt + instruksi setup yang disalin ke AI coding agent user.
- **Skill pack** — `numa init` memasang 5 skill bundled (`numa-tdd`, `numa-incremental`, `numa-api-design`, `numa-security`, `numa-frontend`) ke `.claude/skills/` plus kontrak arsitektur project.
- **CLI `numa`** — loop eksekusi task di terminal: `login`, `switch`, `whoami`, `next`, `start`, `context`, `done` (dengan guard verifikasi file + `validation_commands`, flag `--force`/`--dir`), `prd`, `status`, `init`, `sync`, `logout`. Tanpa mock fallback — error AI selalu eksplisit.
- **Checkpoint gate** — saat layer selesai, agent berhenti dan meminta approval user (`LAYER_TRANSITION`, `PRD_APPROVAL`, `ROADMAP_APPROVAL`, `APPS_READY_FOR_USE`).
- **Repo summary** — `numa sync` mengirim file tree + manifest workspace ke server agar konteks agent selalu relevan.

### 6. Lain-lain

- **Auth** — Better Auth (cookie session), register/login.
- **Billing** — paket Free Trial / Starter / Pro dengan batas jumlah project, putaran survey, dan panjang input. Endpoint checkout + webhook pembayaran. Ekspor paket `.zip` (PRD.md + TASKS.md) khusus paket Pro.
- **Profil & pengaturan** — edit profil, kelola PAT (generate, list, revoke), riwayat pembayaran.
- **Observabilitas** — `AiCallLog` (model, tokens, latensi, retry) dan endpoint AI metrics global maupun per project.
- **Landing page** — hero dengan typewriter headline, fitur, terminal demo, pricing, smooth scroll.
- **Akses publik** — tunnel Cloudflare di `https://numa.mrijal.my.id`.

## Stack

- **apps/web** — Vite + React + TypeScript + Tailwind + shadcn-style + react-router v7 + TanStack Query + better-auth/react. Port **3455**.
- **apps/api** — Express + Prisma + Zod + Better Auth (Prisma adapter). Port **6655**.
- **packages/cli** — `numa` (commander) — dipanggil sebagai `npx numa`. Tanpa mock fallback.
- **DB** — PostgreSQL lokal `project_ai_planner` di `localhost:5432` (user `postgres`).
- **AI** — Gateway lokal OpenAI-compatible `http://localhost:20128/v1` (model `ai-builder`). Multi-provider via env.

## Struktur Monorepo

```
.
├── apps/
│   ├── api/          # Express + Prisma + Zod + Better Auth (port 6655)
│   │   ├── prisma/   # schema.prisma + migrations + seed.ts
│   │   └── src/
│   │       ├── index.ts              # semua route (sengaja flat)
│   │       ├── lib/{prisma,auth,billing}.ts
│   │       ├── lib/ai/*              # ai-service, chat, prd, roadmap, tasks, cycle,
│   │       │                         # golden-stack, stack-contract, architecture-contract,
│   │       │                         # dag-validator, cleanup-validator, api-coverage-validator,
│   │       │                         # essential-files-validator, security-audit, schemas, prompts
│   │       ├── middleware/{require-user,require-agent}.ts
│   │       └── tools/registry.ts
│   └── web/          # Vite + React + Tailwind + shadcn (port 3455)
│       └── src/
│           ├── components/{ui,layout,chat,wizard,kanban,cycle,execution,billing}/
│           ├── pages/{login,profile,chat,landing/*,projects/*,settings/*}
│           └── lib/{utils,http,auth-client}.ts
├── packages/cli/     # numa (commander) + skill pack bundled
└── scripts/          # test-e2e-wizard.ts
```

## Quick Start

```bash
# dari root monorepo
npm install
cd apps/api
npx prisma migrate dev --name init   # schema fresh
npx tsx prisma/seed.ts               # data demo (opsional)
```

```bash
# Terminal 1 — API
cd apps/api
npx tsx src/index.ts
```

```bash
# Terminal 2 — Web
cd apps/web
npx vite --port 3455
```

```bash
# Terminal 3 — coba CLI
numa login numa_demo_seed_token_replace_in_app
numa next
numa start
numa context
numa done
```

`numa` saat dev dipanggil via wrapper script di `~/.local/bin/numa` yang menjalankan `tsx` ke `packages/cli/src/index.ts`. Untuk distribusi production, `packages/cli` dipublish ke npm.

## Alur Aplikasi (Wizard 8 Tahap)

Tahap yang sudah dilewati terkunci read-only (HTTP 403 via `isStageLocked`). Tahap sebelumnya bisa dibuka kembali via `POST /api/projects/:id/wizard-step`.

| # | Fitur | Tahap | Halaman | Fungsi |
|---|-------|-------|---------|--------|
| 1 | Numa Brief | `chat` | `/chat/:sessionId` | Brainstorming ide awal dengan AI. |
| 2 | Numa Brief | `survey` | `/projects/:id/survey` | Pertanyaan discovery; jawab sendiri atau pakai rekomendasi AI. |
| 3 | Numa Blueprint | `techstack` | `/projects/:id/techstack` | Golden Stack (default, langsung lanjut) atau pilih manual. |
| 4 | Numa Blueprint | `prd` | `/projects/:id/prd` | AI generate PRD/BRD terstruktur. |
| 5 | Numa Flow | `tree` | `/projects/:id/tree` | Hierarki dekomposisi App -> Fitur -> Sub-fitur. |
| 6 | Numa Forge | `board` | `/projects/:id/board` | Atomic tasks di kanban + roadmap DAG. |
| 7 | Numa Agent | `guide` | - | Master Prompt + PAT token. |
| 8 | Numa Agent | `done` | - | AI coding agent eksekusi via CLI; checkpoint gate antar layer. |

Alur eksekusi agent:

```
npx numa login <token>
npx numa init            # pasang skill pack + kontrak arsitektur
npx numa next
npx numa start
npx numa context
# kerjakan task HANYA pada file yang diizinkan
npx numa done
npx numa sync            # (opsional) kirim ringkasan workspace
```

## Isolasi & Keamanan

- PAT disimpan sebagai `sha256(token)` di DB. Plaintext hanya dikembalikan SEKALI saat generate.
- `requireAgent` middleware attach `projectId` ke request. Agent hanya bisa akses task/PRD project itu.
- Uji: token project A ditolak untuk task project B (HTTP 404 "Task tidak ditemukan di project ini.").
- Rate limiter pada endpoint agent-token.

## Paket Langganan

| Paket | Harga | Project Aktif | Putaran Survey | Panjang Input | Ekspor .zip |
|---|---|---|---|---|---|
| Free Trial | Rp 0 | 1 | 1 | 1.000 karakter | - |
| Starter | Rp 49.000 | 2 | 3 | 2.000 karakter | - |
| Pro | Rp 129.000 | 5 | 4 | 4.000 karakter | Ya |

## Env (apps/api/.env)

```
DATABASE_URL=postgresql://postgres:admin123@localhost:5432/project_ai_planner
PORT=6655
# Daftar origin yang diizinkan, dipisah koma (lokal untuk dev + domain publik untuk akses luar)
FE_URL=http://localhost:3455,https://numa.mrijal.my.id
AI_PROVIDER=openai
OPENAI_BASE_URL=http://localhost:20128/v1
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=ai-builder
BETTER_AUTH_SECRET=<random>
BETTER_AUTH_URL=https://numa.mrijal.my.id
```

## Akses dari Komputer Lain (Cloudflare Tunnel)

Aplikasi di-expose lewat tunnel Cloudflare di satu hostname `numa.mrijal.my.id`
(remotely-managed tunnel — ingress diatur dari dashboard Zero Trust, bukan file lokal).

### Ingress di dashboard Cloudflare (Zero Trust > Networks > Tunnels > Public Hostname)

| Urutan | Hostname | Path | Service |
|---|---|---|---|
| 1 | `numa.mrijal.my.id` | `/api/*` | `http://localhost:6655` |
| 2 | `numa.mrijal.my.id` | (sisanya) | `http://localhost:3455` |

Urutan penting: rule `/api/*` harus di atas rule catch-all.

### Web (apps/web/.env)

```
VITE_API_URL=https://numa.mrijal.my.id
```

Dev lokal boleh mengosongkan `VITE_API_URL` (default `http://localhost:6655`).

### CLI di komputer lain

CLI dipublish ke npm registry:

```bash
npm install -g numa-cli
numa login <token PAT dari web UI> --api-url https://numa.mrijal.my.id
numa next && numa start && numa context && numa done
```

URL API tersimpan di `~/.numa/config.json` saat login, jadi perintah berikutnya tidak perlu flag lagi. Alternatif: set env `NUMA_API_URL` atau edit `~/.numa/config.json` manual.

## Endpoints API

### Publik & Autentikasi

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| GET | `/health` | - | health check |
| GET | `/api/tools` | - | daftar tools (registry) |
| ALL | `/api/auth/*` | - | Better Auth handler |
| GET/PATCH | `/api/user/plan`, `/api/user/profile` | user | info paket & profil |

### Project & Wizard

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| GET/POST | `/api/projects` | user | list/create project |
| GET | `/api/projects/:id` | user | detail project |
| POST | `/api/projects/:id/wizard-step` | user | buka kembali tahap sebelumnya |
| GET | `/api/projects/:id/export.zip` | user (Pro) | ekspor PRD.md + TASKS.md |
| POST | `/api/chat/sessions` | user | mulai sesi chat |
| GET/POST | `/api/chat/sessions/:id/messages` | user | riwayat & kirim pesan |
| POST | `/api/chat/sessions/:id/finalize`, `/retry` | user | kunci ide / ulangi balasan |
| GET | `/api/projects/:id/survey` | user | daftar pertanyaan discovery |
| POST | `/api/projects/:id/survey/submit`, `/complete` | user | jawab & selesaikan survey |
| POST | `/api/projects/:id/techstack/recommend` | user | rekomendasi AI |
| PUT | `/api/projects/:id/techstack` | user | simpan pilihan stack |
| POST | `/api/projects/:id/prd/generate` (`/brd/generate`) | user | AI generate PRD (SSE) |
| GET | `/api/projects/:id/prd` (`/brd`) | user | PRD viewer |
| GET | `/api/projects/:id/prd/download` (`/brd/download`) | user | unduh PRD Markdown |
| POST | `/api/projects/:id/tree/generate` | user | AI generate tree |
| GET | `/api/projects/:id/tree` | user | hierarki tree |
| POST | `/api/projects/:id/roadmap/generate` | user | AI generate roadmap |
| GET | `/api/projects/:id/roadmap` | user | roadmap + edges |
| POST | `/api/projects/:id/tasks/generate` | user | AI generate atomic tasks |
| GET | `/api/projects/:id/tasks` | user | daftar task board |
| PATCH | `/api/tasks/:taskId` | user | update status/posisi task |
| GET | `/api/projects/:id/master-prompt` | user | template Master Prompt |

### Change Cycle

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| POST | `/api/projects/:id/change-request` | user | ajukan perubahan (reset ke survey) |
| GET | `/api/projects/:id/cycles` | user | daftar siklus + dampak |
| GET | `/api/projects/:id/cycles/:cycleId` | user | detail siklus |
| POST | `/api/projects/:id/cycles/:cycleId/generate` | user | generate task siklus (split a/b) |

### Token, Checkpoint & Observabilitas

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| POST | `/api/projects/:id/agent-tokens` | user | generate PAT |
| GET | `/api/projects/:id/agent-tokens`, `/api/agent-tokens` | user | list token |
| DELETE | `/api/agent-tokens/:tokenId` | user | revoke token |
| GET/POST | `/api/projects/:id/checkpoints` | user | daftar & buat checkpoint |
| POST | `/api/checkpoints/:id/approve` | user | approve/reject checkpoint |
| GET | `/api/ai-metrics`, `/api/projects/:id/ai-metrics` | user | metrik pemanggilan AI |
| POST | `/api/billing/checkout`, `/api/billing/webhook` | user/- | pembayaran langganan |

### Agent (PAT)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/agent/whoami` | identitas token & project |
| GET | `/api/agent/scopes` | daftar project yang diakses token |
| GET | `/api/agent/tasks/next` | task berikutnya |
| POST | `/api/agent/tasks/:id/start` | tandai IN_PROGRESS |
| POST | `/api/agent/tasks/:id/complete` | DONE/REVIEW + auto checkpoint |
| POST | `/api/agent/tasks/:id/fail` | laporkan kegagalan task |
| GET | `/api/agent/tasks/:id/context` | Markdown bounded context |
| GET | `/api/agent/prd` (`/brd`) | PRD project |
| GET | `/api/agent/architecture-contract` | kontrak arsitektur |
| POST | `/api/agent/repo-summary` | simpan ringkasan workspace |
