# PRD — Numa (AI Software Factory)

> Dokumen kebutuhan produk untuk workspace perencanaan dan eksekusi software Numa.
> Sumber: kondisi aktual project per September 2026 (README.md, AGENTS.md, BRAND.md).

---

## 1. Ringkasan Produk

**Numa** adalah workspace SaaS yang mengubah ide produk menjadi pekerjaan terstruktur dan siap dieksekusi oleh AI coding agent di komputer lokal user.

Pipeline utama:

**Numa Brief** (Chat & Survey) -> **Numa Blueprint** (Tech Stack & PRD) -> **Numa Forge** (Kanban Tasks) -> **Numa Agent** (CLI Runner & Change Cycle).

**Positioning**: *"Numa is the software planning and execution workspace that turns product ideas into structured, agent-ready work."*

**Masalah yang diselesaikan**: gap antara ide mentah dan kode — biasanya butuh manual planning, penulisan PRD, dan task breakdown. Numa mengotomasi seluruh pipeline ini dengan bounded context ketat agar hasilnya benar-benar bisa dieksekusi agent tanpa improvisasi liar.

## 2. Sasaran

| # | Sasaran | Ukuran keberhasilan |
|---|---------|---------------------|
| G1 | Ide mentah menjadi task atomic siap eksekusi dalam satu sesi wizard | User menyelesaikan 7 tahap tanpa intervensi manual di luar wizard |
| G2 | Task yang dihasilkan aman dieksekusi agent secara otonom | Setiap task punya `files_to_create`, `files_to_modify`, `forbidden`, `validation_commands`, dan acceptance criteria |
| G3 | Eksekusi agent terisolasi per project | Token project A ditolak mengakses task project B (HTTP 404) |
| G4 | Perubahan pasca-eksekusi terkelola | Change Cycle menghasilkan siklus task baru tanpa merusak task selesai |
| G5 | Monetisasi via langganan bertingkat | Free Trial / Starter / Pro dengan batas project, putaran survey, panjang input |

## 3. Target Pengguna

**Utama**: developer yang ingin mempercepat fase planning dan bootstrapping project baru menggunakan AI.

Karakteristik:
- Paham dasar software engineering (istilah layer, dependency, acceptance criteria dipahami).
- Memakai AI coding agent di terminal (mis. Claude Code) untuk eksekusi.
- Butuh struktur, bukan "generate aplikasi instan".

**Persona sekunder**: technical founder / lead yang butuh dokumentasi planning cepat (PRD + task breakdown) untuk tim kecil.

## 4. Brand Voice & Batasan Komunikasi

Mengikuti [BRAND.md](BRAND.md):

- Nada: tenang, analitis, faktual — partner arsitektur, bukan chatbot cerewet.
- Presisi teknis: gunakan terminologi bounded context, DAG, layer, dependency, acceptance criteria.
- **Dilarang**: klaim berlebihan ("bangun aplikasi apa saja secara instan"), bahasa AI generik ("magic happens here"), nada menggurui, dan **emoji** di semua teks, UI, label, commit, atau dokumen.
- Semua komunikasi ke user, string UI, dan komentar publik dalam **Bahasa Indonesia** (identifier kode tetap Bahasa Inggris).

## 5. Alur Utama — Wizard 7 Tahap

Tahap yang sudah dilewati terkunci read-only (HTTP 403 via `isStageLocked`). Tahap sebelumnya bisa dibuka kembali via `POST /api/projects/:id/wizard-step`.

| # | Fitur | Tahap | Halaman | Fungsi |
|---|-------|-------|---------|--------|
| 1 | Numa Brief | `chat` | `/chat/:sessionId` | Brainstorming ide awal dengan AI |
| 2 | Numa Brief | `survey` | `/projects/:id/survey` | Pertanyaan discovery; jawab sendiri atau pakai rekomendasi AI |
| 3 | Numa Blueprint | `techstack` | `/projects/:id/techstack` | Golden Stack (default, langsung lanjut) atau pilih manual |
| 4 | Numa Blueprint | `prd` | `/projects/:id/prd` | AI generate PRD/BRD terstruktur beserta journey pengguna |
| 5 | Numa Forge | `board` | `/projects/:id/board` | Atomic tasks di kanban + roadmap DAG |
| 6 | Numa Agent | `guide` | - | Master Prompt + PAT token |
| 7 | Numa Agent | `done` | - | AI coding agent eksekusi via CLI; checkpoint gate antar layer |

## 6. Kebutuhan Fungsional

### 6.1 Numa Brief — Brainstorming & Discovery

| ID | Kebutuhan | Prioritas |
|----|-----------|-----------|
| FR-1.1 | Chat onboarding: kirim pesan, `finalize` untuk mengunci ide, `retry` bila hasil AI belum tepat | Wajib |
| FR-1.2 | Survey kebutuhan: AI generate pertanyaan discovery; user menjawab sendiri atau memakai rekomendasi AI. Jumlah putaran mengikuti paket langganan. Route lama `/interview` dialihkan ke `/survey` | Wajib |
| FR-1.3 | Change Cycle: setelah semua task DONE, user mengajukan permintaan perubahan; sistem membuat `ProjectCycle` (DRAFT/OPEN/DONE) berisi diff PRD, klarifikasi, dampak, lalu generate task siklus. Guard: semua task wajib DONE dan tidak ada siklus aktif. Permintaan panjang boleh dipecah (split `a`/`b`) | Wajib |

### 6.2 Numa Blueprint — Tech Stack & Dokumen

| ID | Kebutuhan | Prioritas |
|----|-----------|-----------|
| FR-2.1 | Golden Stack: 4 paket terstandarisasi dengan kontrak arsitektur ketat — React+Express, Vue+NestJS, Next.js Fullstack, Laravel PHP. Opsi database terbatas (SQLite/PostgreSQL/MySQL/Supabase; Laravel: MySQL/PostgreSQL/SQLite) | Wajib |
| FR-2.2 | Rekomendasi AI otomatis (default, langsung lanjut) atau pilih manual per kategori. `validateGoldenSelection` menolak kombinasi di luar kontrak (mis. MongoDB, Drizzle, TypeORM) | Wajib |
| FR-2.3 | PRD/BRD terstruktur (functional requirements, product rules, constraints) dengan versioning, unduh Markdown, dan stream SSE saat generate | Wajib |

### 6.3 Journey Pengguna (di Numa Blueprint)

| ID | Kebutuhan | Prioritas |
|----|-----------|-----------|
| FR-3.1 | Spec PRD memuat journey pengguna: jalur `main` (sampai berhasil) dan jalur `failure` yang bercabang lewat `branchFrom` (journey dan langkah asal), merujuk edge case EC-xxx dan requirement. Ditampilkan di halaman PRD | Wajib |
| FR-3.2 | Skenario E2E disusun dari journey dan disuntikkan ke task INTEGRATION; cakupan requirement per journey diperiksa (warning `JOURNEY_REQ_UNCOVERED`) tanpa panggilan AI tambahan | Wajib |

### 6.4 Numa Forge — Atomic Tasks

| ID | Kebutuhan | Prioritas |
|----|-----------|-----------|
| FR-4.1 | AI generate atomic tasks dengan bounded context: `files_to_create`, `files_to_modify`, `forbidden`, `validation_commands`, acceptance criteria, layer, dan relasi DAG antar task. Kanban board dengan polling otomatis 3 detik | Wajib |
| FR-4.2 | Validator pasca-generate (heuristik non-AI + AI): `dag-validator` (deteksi siklus, buang dependency invalid, topological sort), `cleanup-validator` (duplikasi file, task oversized, task tanpa validation commands), `api-coverage-validator` (setiap endpoint mutasi backend wajib punya task consumer frontend), `security-audit` (audit AppSec pra-implementasi, kriteria keamanan disuntikkan ke task), `essential-files-validator` (kelulusan task dinilai dari AC + validation commands multi-stack) | Wajib |

### 6.5 Numa Agent — Eksekusi via CLI

| ID | Kebutuhan | Prioritas |
|----|-----------|-----------|
| FR-5.1 | Master Prompt (`/api/projects/:id/master-prompt`): template prompt + instruksi setup, disalin ke AI coding agent user | Wajib |
| FR-5.2 | Skill pack: `numa init` memasang 7 skill bundled (`numa-workflow`, `numa-incremental`, `numa-tdd`, `numa-api-design`, `numa-security`, `numa-production`, `numa-frontend`) ke `.agents/skills/` (salinan di `.claude/skills/`) plus kontrak arsitektur project | Wajib |
| FR-5.3 | CLI `numa` — loop eksekusi task: `login`, `switch`, `whoami`, `next`, `start`, `context`, `done` (guard verifikasi file + `validation_commands`, flag `--force`/`--dir`), `prd`, `status`, `init`, `sync`, `logout`. **Tanpa mock fallback** — error AI selalu eksplisit (HTTP 502 + pesan) | Wajib |
| FR-5.4 | Checkpoint gate: saat layer selesai, agent berhenti dan meminta approval user (`LAYER_TRANSITION`, `PRD_APPROVAL`, `ROADMAP_APPROVAL`, `APPS_READY_FOR_USE`) | Wajib |
| FR-5.5 | Repo summary: `numa sync` mengirim file tree + manifest workspace ke server agar konteks agent selalu relevan | Wajib |

### 6.6 Platform & Lain-lain

| ID | Kebutuhan | Prioritas |
|----|-----------|-----------|
| FR-6.1 | Auth: Better Auth (cookie session), register/login | Wajib |
| FR-6.2 | Billing: paket Free Trial / Starter / Pro dengan batas jumlah project, putaran survey, dan panjang input. Endpoint checkout + webhook pembayaran | Wajib |
| FR-6.3 | Ekspor paket `.zip` (PRD.md + TASKS.md) khusus paket Pro | Wajib |
| FR-6.4 | Profil & pengaturan: edit profil, kelola PAT (generate, list, revoke), riwayat pembayaran | Wajib |
| FR-6.5 | Observabilitas: `AiCallLog` (model, tokens, latensi, retry, success) + endpoint AI metrics global maupun per project | Wajib |
| FR-6.6 | Landing page: hero dengan typewriter headline, fitur, terminal demo, pricing, smooth scroll | Wajib |
| FR-6.7 | Akses publik via tunnel Cloudflare di `https://numa.opendv.xyz` (ingress `/api/*` -> 6655, sisanya -> 3455) | Wajib |

## 7. Paket Langganan

| Paket | Harga | Project Aktif | Putaran Survey | Panjang Input | Ekspor .zip |
|---|---|---|---|---|---|
| Free Trial | Rp 0 | 1 | 1 | 1.000 karakter | - |
| Starter | Rp 49.000 | 2 | 3 | 2.000 karakter | - |
| Pro | Rp 129.000 | 5 | 4 | 4.000 karakter | Ya |

## 8. Kebutuhan Non-Fungsional

| ID | Kebutuhan |
|----|-----------|
| NFR-1 | **Keamanan token**: PAT disimpan sebagai `sha256(token)` di DB; plaintext hanya dikembalikan SEKALI saat generate |
| NFR-2 | **Isolasi project**: `requireAgent` middleware attach `projectId`; agent hanya bisa akses task/PRD project sendiri. Uji: token project A ditolak untuk task project B (HTTP 404 "Task tidak ditemukan di project ini.") |
| NFR-3 | **Rate limiting** pada endpoint agent-token |
| NFR-4 | **Tanpa hardcode secret**: credential wajib via env var / secret manager; file `.env` masuk `.gitignore` |
| NFR-5 | **Tanpa mock fallback** di CLI/API — kegagalan AI tampil eksplisit |
| NFR-6 | **Kontrak arsitektur ketat**: kombinasi tech stack di luar Golden Stack ditolak di level validasi |
| NFR-7 | **Bahasa**: semua UI/komunikasi Bahasa Indonesia; tanpa emoji (pakai ikon `lucide-react`) |
| NFR-8 | **Aksesibilitas multi-komputer**: web + CLI dapat diakses dari komputer lain lewat tunnel Cloudflare; CLI remote via `npm i -g numa-cli` + `NUMA_API_URL` |

## 9. Model Data Utama (Prisma)

| Model | Fungsi |
|-------|--------|
| `User`, `Session`, `Account` | Autentikasi (Better Auth) |
| `Project` | Entitas root: nama, deskripsi, ide mentah, `wizardStep`, `uiSpec` JSON |
| `ProjectCycle` | Siklus perubahan (DRAFT/OPEN/DONE): diff PRD, klarifikasi, dampak |
| `Stack` | Tech stack per kategori (frontend, backend, database, deployment) |
| `DiscoveryQuestion`, `DiscoveryAnswer` | Pertanyaan dan jawaban fase survey |
| `Prd` | Dokumen kebutuhan produk JSON + versioning |
| `RoadmapPhase`, `RoadmapFeature`, `RoadmapDependency` | Graph rencana pengembangan |
| `Task`, `TaskDependency` | Atomic task: bounded context JSON, acceptance criteria, layer, relasi DAG |
| `TreeNode`, `BusinessFlow` | Legacy, tidak lagi digenerate; dibuang di akhir rencana journey |
| `Checkpoint` | Gate review antar layer arsitektur (human-in-the-loop) |
| `AgentToken`, `AgentTokenScope` | PAT token CLI (hash sha256, multi-project scope) |
| `AgentSession` | Tracking sesi kerja agent |
| `AiCallLog` | Observabilitas: model, tokens, latensi, retry, success |

## 10. Arsitektur & Stack

| Layer | Teknologi |
|-------|-----------|
| **apps/web** | Vite + React + TypeScript + Tailwind + shadcn-style + react-router v7 + TanStack Query + better-auth/react (port 3455) |
| **apps/api** | Express + Prisma + Zod + Better Auth (Prisma adapter) (port 6655); semua route flat di `src/index.ts` |
| **packages/cli** | `numa` (commander), dipanggil sebagai `npx numa` |
| **DB** | PostgreSQL lokal `project_ai_planner` di `localhost:5432` |
| **AI** | Gateway OpenAI-compatible lokal `http://localhost:20128/v1` (model `ai-builder`); multi-provider via env |
| **Runtime** | Docker Compose (`docker compose up -d --build`) |

Modul AI engine (`apps/api/src/lib/ai/`): `ai-service` (client, auto-retry Zod, logging, model routing reasoning/cheap), `chat`, `prd`, `roadmap`, `tasks`, `cycle`, `product-spec`, `journey-contract`, `flow-contract` (legacy), `golden-stack`, `stack-contract`, `architecture-contract`, validator (`dag`, `cleanup`, `api-coverage`, `security-audit`), `schemas`, `prompts`.

## 11. Batasan & Kontrak

- **Golden Stack**: hanya 4 paket yang sah (lihat FR-2.1). Kombinasi di luar kontrak ditolak `validateGoldenSelection`.
- **Bounded context wajib**: setiap task WAJIB punya `files_to_create`, `files_to_modify`, `forbidden`, `validation_commands` — agent hanya boleh menyentuh file yang diizinkan.
- **Guard `numa done`**: verifikasi file + `validation_commands` dijalankan sebelum task ditandai selesai (override `--force` dengan risiko user).
- **Stage lock**: tahap wizard yang sudah dilewati read-only; buka kembali hanya via endpoint resmi.
- **Change Cycle guard**: hanya bisa diajukan saat semua task DONE dan tidak ada siklus aktif.
- **PAT plaintext** tidak pernah disimpan atau ditampilkan ulang setelah generate.

## 12. Antarmuka API (Ringkas)

Detail lengkap di [README.md](README.md) bagian Endpoints API. Kelompok utama:

| Kelompok | Endpoint inti | Auth |
|----------|---------------|------|
| Publik & Auth | `/health`, `/api/tools`, `/api/auth/*`, `/api/user/plan`, `/api/user/profile` | - / user |
| Project & Wizard | CRUD `/api/projects`, `wizard-step`, `export.zip`, chat sessions, survey, techstack, prd, roadmap, tasks, master-prompt | user |
| Change Cycle | `change-request`, `cycles`, `cycles/:id/generate` | user |
| Token & Checkpoint | `agent-tokens`, `checkpoints`, `ai-metrics`, `billing/*` | user / - |
| Agent (PAT) | `whoami`, `scopes`, `tasks/next`, `start`, `complete`, `fail`, `context`, `prd`, `architecture-contract`, `repo-summary` | PAT |

## 13. Di Luar Cakupan (Saat Ini)

- Eksekusi kode agent langsung di server Numa (eksekusi selalu di komputer user).
- Tech stack di luar 4 paket Golden Stack.
- Kolaborasi tim multi-user dalam satu project.
- Marketplace skill/agent pihak ketiga.
- Mobile app.

## 14. Risiko

| Risiko | Mitigasi |
|--------|----------|
| Hasil generate AI tidak konsisten | Auto-retry Zod, validator pasca-generate berlapis, tanpa mock fallback |
| Agent menyentuh file di luar konteks | Bounded context + guard verifikasi file di `numa done` |
| Kebocoran token antar project | Hash sha256, scope per project, `requireAgent`, uji isolasi |
| Task DAG bermutu rendah (siklus, duplikat, oversized) | `dag-validator`, `cleanup-validator`, `api-coverage-validator` |
| Biaya AI membengkak | `AiCallLog`, model routing (reasoning vs cheap), metrik per project |
