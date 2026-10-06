# Rencana Refactor Numa — Menuju SaaS Enterprise

> Hasil audit pipeline (web, API, CLI, skill pack) per 5 Oktober 2026.
> Dokumen ini adalah sumber kebenaran untuk urutan pekerjaan refactor. Status tiap butir diperbarui saat dikerjakan.

## 1. Keputusan Arsitektur

| # | Keputusan | Alasan |
|---|-----------|--------|
| D1 | Business flow dipertahankan, tetapi menjadi **kontrak yang dibaca generator task** (skenario E2E, pemeriksaan cakupan), bukan hanya diagram. | Sebelum ini `BusinessFlow` dan `TreeNode` tidak dibaca oleh tahap mana pun setelahnya. |
| D2 | PRD memakai **spec JSON terstruktur** sebagai sumber kebenaran, markdown adalah hasil render. | `dataModels` dan `apiEndpoints` yang diharapkan generator task dan `numa context` tidak pernah terisi dari PRD markdown. |
| D3 | Multi-tenancy (Organization, Membership, RBAC) masuk Fase 3. Billing pindah ke tingkat organisasi secara bertahap. | Syarat dasar penjualan ke tim/enterprise. |
| D4 | Antrean job memakai tabel `AiJob` yang sudah ada dengan klaim atomik (`FOR UPDATE SKIP LOCKED`) dan heartbeat, tanpa menambah infrastruktur baru. | Tahan restart dan bisa di-scale horizontal tanpa Redis. |
| D5 | Tidak ada mock fallback. Error AI tetap eksplisit (HTTP 502). | Aturan proyek yang sudah ada. |

## 2. Temuan Utama

### 2.1 Keamanan dan bug (kritis)

| ID | Temuan | Lokasi |
|----|--------|--------|
| S1 | IDOR: checkpoints per project bisa dibaca user lain. | `apps/api/src/routes/checkpoints.ts` |
| S2 | Daftar email dengan paket berbayar tertulis di kode (`PRESET_USER_TIERS`). | `apps/api/src/lib/billing.ts` |
| S3 | Fallback password database tertulis di compose produksi. | `docker-compose.prod.yml` |
| S4 | `validation_commands` dari server dijalankan `sh -c` di laptop user tanpa allowlist. | `packages/cli/src/guard.ts` |
| S5 | Master prompt menyuruh user menempel PAT ke prompt AI agent. | `apps/api/src/routes/master-prompt.ts` |
| B1 | `flow_generate` tidak ada di `validTypes` endpoint polling. | `apps/api/src/routes/tasks.ts` |
| B2 | Checkpoint gate hanya berupa teks, `tasks/next` tidak menolak. | `apps/api/src/routes/agent.ts` |
| B3 | `files_to_create` dikosongkan dan guard hanya mengecek `forbidden` terhadap seluruh worktree. | `agent.ts`, `guard.ts` |
| B4 | Token otomatis mengakses semua project milik user, `AgentTokenScope` tidak berfungsi sebagai pembatas. | `middleware/require-agent.ts` |

### 2.2 Kualitas pipeline

- Tree, Flow, dan Roadmap tumpang tindih. Hanya Roadmap yang sampai ke task.
- `security-audit.ts` dan `essential-files-validator.ts` tidak dipakai. `uiSpec` tidak pernah dibuat.
- Hasil validator hanya `console.warn`, tidak terlihat oleh user.
- Generate ulang task menghapus seluruh task.

### 2.3 Celah SaaS enterprise

Tidak ada organisasi/RBAC, SSO, audit log, antrean job yang tahan restart, budget token per tenant, ekspor/hapus data, dan CI gate sebelum deploy.

## 3. Rencana Bertahap

### Fase 0 — Hotfix keamanan dan bug

- [x] F0.1 Perbaiki IDOR checkpoints, audit semua route `:id` lain.
- [x] F0.2 Hapus `PRESET_USER_TIERS`. Penetapan paket manual lewat variabel lingkungan `ADMIN_PLAN_OVERRIDES` (opsional) atau seed.
- [x] F0.3 Hapus default password di compose produksi (wajib dari env).
- [x] F0.4 Tambahkan `flow_generate` ke daftar tipe job yang valid (satu sumber tipe).
- [x] F0.5 Tegakkan checkpoint di `tasks/next` dan `tasks/:id/start` (HTTP 409).
- [x] F0.6 Hilangkan URL dan domain yang tertulis langsung (`localhost:9999`, fallback domain).

### Fase 1 — Spec terstruktur sebagai inti

- [x] F1.1 Skema `ProductSpec` (personas, entities, endpoints, rules, journeys) dan ekstraksi dari PRD markdown.
- [x] F1.2 `readPrdContent` mengembalikan `dataModels` dan `apiEndpoints` dari spec.
- [x] F1.3 Flow menjadi kontrak: jalur flow menjadi skenario E2E untuk task INTEGRATION, step Sistem diperiksa cakupannya.
- [x] F1.4 Sambungkan `security-audit` dan `essential-files-validator`, atau hapus bila tidak relevan. `uiSpec` dibuat atau blok konteksnya dihapus.
- [x] F1.5 Simpan laporan validasi (`ValidationReport`) dan tampilkan lewat API sebagai quality gate.

### Fase 2 — CLI yang aman dan bisa diaudit

- [x] F2.1 PAT dengan masa kedaluwarsa dan scope eksplisit. Master prompt tidak lagi memuat token. Login interaktif lewat variabel lingkungan atau stdin.
- [x] F2.2 Konfigurasi per workspace (`.numa/workspace.json`), baseline commit saat `start`, guard berbasis allowlist file.
- [x] F2.3 Allowlist dan konfirmasi untuk `validation_commands`. `--force` dicatat di server.
- [x] F2.4 Perintah `retry`, `block`, `checkpoint`. Skill pack diberi versi.

### Fase 3 — Fondasi SaaS

- [x] F3.1 `Organization`, `Membership`, RBAC (owner/admin/member/viewer).
- [x] F3.2 Antrean job tahan restart: klaim atomik, heartbeat, retry, pembatalan.
- [x] F3.3 `AuditLog` untuk aksi sensitif.
- [x] F3.4 Budget token dan rate limit per tenant.
- [x] F3.5 Versi artefak: generate ulang task tidak menghapus task yang sudah DONE.

### Fase 4 — Kesiapan enterprise

- [x] F4.1 Ekspor dan penghapusan data akun.
- [x] F4.2 Structured logging dengan request id.
- [x] F4.3 CI: typecheck, test, validasi Prisma sebelum deploy. Image diberi tag versi (commit SHA).
- [x] F4.4 Test untuk modul AI (skema, validator) dan route agent.
- [x] F4.5 SSO/OIDC: kerangka siap (env-gated); pemilihan penyedia identitas tetap keputusan di luar kode (lihat bagian 4).

## 4. Hal di luar pekerjaan kode

- Rotate password database dan semua secret yang pernah tertulis di repo atau compose.
- SSO/SAML memerlukan keputusan penyedia identitas dan kontrak pelanggan, sehingga F4.5 hanya disiapkan kerangkanya.
- Migrasi data produksi (backfill organisasi untuk user lama) dijalankan manual setelah ditinjau.

## 5. Catatan Pelaksanaan

Status dan penyimpangan dari rencana dicatat di bagian ini saat pengerjaan.

### Fase 0 (selesai)

- F0.1: GET checkpoints per project kini memeriksa kepemilikan. Route `ai-metrics` juga tidak lagi menampilkan log global (`projectId: null`).
- F0.5: gate berada di `lib/checkpoint-gate.ts`. Hanya LAYER_TRANSITION, PRD_APPROVAL, dan ROADMAP_APPROVAL yang memblokir. APPS_READY_FOR_USE sengaja tidak memblokir karena dibuat sebelum task INTEGRATION selesai. Checkpoint LAYER_TRANSITION kini tidak dibuat ganda. UI approve ada di `components/kanban/checkpoint-banner.tsx` (dipasang di halaman board).
- F0.3/F0.6: `docker-compose.prod.yml` mewajibkan `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FE_URL`, `VITE_API_URL`. `docker-compose.yml` (khusus dev lokal) tetap memakai fallback password dev. `vite.config.ts` membaca `VITE_ALLOWED_HOSTS`. Domain dan origin terpusat di `apps/api/src/lib/config.ts`.
- Tindakan manual: password `admin123` pernah tertulis di repo, rotate di server database dan perbarui `.env`.

### Fase 1 (selesai)

- F1.1/F1.2: `lib/ai/product-spec.ts` (skema dan ekstraksi, agent `ProductSpecExtractor`, tier cheap). Spec disimpan di `Prd.content.spec`. `readPrdContent` menurunkan `dataModels`, `apiEndpoints`, dan `productRules` dari spec sehingga `numa context` dan generator task akhirnya menerima data tersebut. Ekstraksi berjalan setelah PRD dibuat, kegagalannya tidak membatalkan PRD (dicoba ulang otomatis di generate task, atau manual lewat `POST /api/projects/:id/prd/spec/extract`).
- Bug ditemukan dan diperbaiki: `parseRequirementIndex` gagal membaca format `- **FR-001**: ...` yang justru diwajibkan prompt PRD.
- F1.3: `lib/ai/flow-contract.ts`. Jalur flow disuntik ke prompt dan, secara deterministik, menjadi acceptance criteria task INTEGRATION (task bertitle test/e2e/journey, atau INTEGRATION terakhir). Step lane sistem yang requirement-nya belum tercakup dilaporkan.
- F1.4: audit keamanan (`security-audit.ts`) kini dipanggil dari quality gate dan kriteria tambahannya digabung ke task. `essential-files-validator.ts` (no-op) dihapus. Blok `uiSpec` (tidak pernah terisi) dihapus dari generator task dan `numa context`; kolom `Project.uiSpec` dibiarkan agar tanpa migrasi destruktif.
- F1.5: tabel `ValidationReport` (migrasi `20261005130000_add_validation_report`), `lib/task-quality.ts`, dan `GET /api/projects/:id/validation-reports`. Temuan hanya mencatat, tidak memblokir. Migrasi perlu dijalankan (`prisma migrate deploy`) di tiap environment. UI web untuk laporan belum dibuat.

### Fase 2 (selesai)

- F2.1: autentikasi PAT dipusatkan di `apps/api/src/lib/agent-auth.ts` (dipakai `requireAgent`, `requireAgentSimple`, `/api/agent/scopes`). Token punya `expiresAt` (default 90 hari, maks 365, parameter `expiresInDays`) dan flag `allProjects`. Bug B4 diperbaiki: token berscope hanya boleh mengakses project di scope-nya; token universal ditandai eksplisit (`allProjects`), bukan diturunkan dari "tidak punya scope", agar token berscope yang project-nya dihapus tidak berubah menjadi universal. Pencabutan token tidak lagi menghapus scope (jejak audit). Migrasi `20261005140000_add_agent_token_expiry` mengisi `allProjects=true` untuk token lama tanpa scope.
- F2.1 (web/prompt): master prompt server dan dialog eksekusi tidak lagi memuat token. Dialog menampilkan langkah login terpisah dengan tombol salin token. PAT mentah dipindah dari `localStorage` ke `sessionStorage` dan sisa lama dibersihkan di halaman profil. Profil menampilkan masa berlaku dan jumlah project per token. CLI `login` membaca argumen (deprecated, ada peringatan), `NUMA_TOKEN`, atau prompt tersembunyi.
- F2.2: konfigurasi berlapis env > `.numa/workspace.json` > `~/.numa/config.json` (`config.ts`). `numa start` mencatat baseline (`task-state.ts`: SHA HEAD dan hash file yang sudah kotor). Guard menilai file yang berubah sejak baseline (worktree, file baru, commit sesudah baseline). `forbidden` memblokir; file di luar `files_to_create + files_to_modify` hanya diperingatkan. Endpoint context kini mengirim `files_to_create` dan `files_to_modify` asli.
- F2.3: `command-policy.ts` menolak metakarakter shell berbahaya, memeriksa tiap segmen `&&` terhadap allowlist, dan meminta konfirmasi (atau `--allow-unlisted`) untuk program di luar allowlist. `--force` mengirim `forced: true`, dan setiap `done` mengirim `guardReport`; server menyimpan di `aiContext.completion` dan menghapus `lastFailure` serta `blockedReason` saat berhasil.
- F2.4: endpoint `POST /api/agent/tasks/:id/retry`, `POST /api/agent/tasks/:id/block`, `GET /api/agent/checkpoints`; perintah CLI `retry`, `block --reason`, `checkpoint`. Skill pack menulis `.numa/skills.version`; `init` dilewati bila versi sama kecuali `--update`/`--force`; `status` memperingatkan versi berbeda. Versi CLI dibaca dari package.json (0.4.0).
- Perubahan perilaku yang perlu diketahui: token lama tanpa `expiresAt` tetap berlaku tanpa batas sampai dicabut. Migrasi harus diterapkan sebelum API baru dijalankan (kolom `allProjects` dibaca saat autentikasi).
- Test: 11 test CLI (`packages/cli`, `npm test`) untuk kebijakan perintah, baseline git, dan glob; API tetap 22 test lulus.

### Fase 3 (selesai)

- F3.1: model `Organization` dan `Membership` (migrasi `20261005150000_add_organization_rbac`). Peran viewer < member < admin < owner. Project pribadi (`orgId` null) dimiliki pembuatnya. Guard `requireProjectRole` di `/api/projects/:id/*` menegakkan viewer untuk GET, member untuk mutasi, admin untuk DELETE; approve checkpoint butuh admin. Helper di `lib/access.ts` (`projectWhere`, `getProjectRole`, `agentProjectWhere`). Token agent hanya boleh bekerja pada project dengan peran member ke atas. Route `routes/orgs.ts` mengelola org, anggota (perlindungan owner terakhir), dan pemindahan project. UI: halaman `/orgs`.
- F3.2: antrean job di tabel `AiJob` (migrasi `20261005160000_ai_job_queue`). Klaim atomik `FOR UPDATE SKIP LOCKED`, heartbeat 20 detik, sweeper 30 detik (stale 90 detik), retry backoff, batas job aktif per user (HTTP 429, `code: job_limit_reached`), pembatalan (`POST /api/projects/:id/ai-jobs/cancel`, kooperatif: hasil dibuang), dan graceful shutdown. Handler terdaftar lewat `registerJobHandler`. Job siklus perubahan `maxAttempts: 1` karena merge delta PRD tidak idempoten. Diverifikasi terhadap Postgres sungguhan (klaim paralel, retry, sweeper, cancel).
- F3.3: tabel `AuditLog` (migrasi `20261005170000_audit_log_and_ai_budget`, tanpa FK agar jejak bertahan setelah data dihapus) dan `lib/audit.ts` (`recordAudit` tidak pernah menggagalkan aksi utama). Dicatat: org create/update/delete, anggota add/role/remove/leave, pemindahan project, project create, token create/revoke, approve checkpoint, perubahan status task, agent force-complete/retry/block, ekspor dan hapus akun. Dibaca lewat `GET /api/orgs/:orgId/audit-logs` dan `GET /api/projects/:id/audit-logs` (admin ke atas, paginasi kursor `before`).
- F3.4: budget token bulanan per pemilik tagihan (`Project.userId`) mengikuti paketnya (free 300 ribu, starter 3 juta, pro 10 juta; override `AI_TOKEN_BUDGET_*`, 0 = tanpa batas). `AiCallLog` kini menyimpan `userId` dan `orgId` dan tidak ikut terhapus saat project dihapus (SetNull), sehingga budget tidak bisa dihindari dengan menghapus project. Pengecekan di `generateJson/Text/TextStream`; `AiBudgetExceededError` tidak diulang. Ringkasan lewat `GET /api/usage/ai`. Rate limit per user: batas job aktif (`AI_MAX_ACTIVE_JOBS_PER_USER`).
- F3.5: tabel `ArtifactVersion` (migrasi `20261005180000_artifact_version`) menyimpan snapshot PRD (generate ulang dan merge siklus) serta business flow sebelum ditimpa; dibaca lewat `GET /api/projects/:id/artifact-versions`. Generate ulang task kini mempertahankan task `DONE`, melewati task hasil generate yang kembar (taskId atau judul), dan menomori task baru setelah order terbesar. Fitur pemulihan (restore) versi belum dibuat.
- Keterbatasan yang diketahui: pembatalan job yang sedang berjalan bersifat kooperatif; timeout job tidak menghentikan pekerjaan di balik layar; log AI tanpa `projectId` tidak bisa diatribusikan ke tenant; penagihan berbasis organisasi belum ada (budget mengikuti pemilik project).
- Penyimpangan dari rencana D3: billing belum dipindah ke organisasi, hanya atribusi budget per pemilik tagihan.

### Fase 4 (selesai)

- F4.1: `GET /api/user/export` (JSON seluruh data akun tanpa hash token) dan `DELETE /api/user/account` (konfirmasi email; ditolak 409 bila akun satu-satunya owner org yang masih punya anggota). Project di org yang masih aktif dialihkan ke owner/admin lain, org tanpa anggota lain ikut dihapus, log AI dan job milik akun dihapus. Riwayat pembayaran ikut terhapus lewat cascade; bila ada kewajiban retensi keuangan, putuskan sebelum dipakai produksi. UI: kartu "Data Akun" di halaman profil. Diverifikasi terhadap Postgres sungguhan.
- F4.2: `lib/logger.ts` (JSON satu baris di produksi, `LOG_LEVEL`, `LOG_FORMAT`) dan `middleware/request-context.ts` (header `X-Request-Id`, access log per request, id dari proxy diterima hanya bila aman). Error handler global menyertakan `requestId` di respons dan log. Pemanggilan `console.*` lama di modul lain belum dimigrasikan.
- F4.3: `.github/workflows/ci.yml` (prisma validate/generate, typecheck API/web/CLI, test ketiganya) dan menjadi syarat `deploy.yml`. Image dipush dengan tag commit SHA dan `latest`; `docker-compose.prod.yml` memakai `NUMA_IMAGE_TAG` (default `latest`) dan deploy menetapkannya ke SHA, sehingga rollback = jalankan ulang dengan SHA lama.
- F4.4: test baru untuk DAG validator, stage, golden stack, budget, request context, dan `authenticateToken` (dengan klien DB yang bisa disuntikkan). Test HTTP route agent end-to-end belum ada karena butuh database; sudah dicakup skrip `scripts/test-e2e-wizard.ts`.
- F4.5: `genericOAuth` Better Auth, aktif hanya bila `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` terisi (PKCE, redirect `/api/auth/oauth2/callback/oidc`). Penautan otomatis ke akun yang ada hanya bila `OIDC_TRUST_EMAIL=true`. Belum ada tombol login SSO di UI, provisioning SCIM, atau SAML.
- Hasil verifikasi akhir: API 53 test, web 7 test, CLI 11 test lulus; typecheck API/web/CLI bersih.

### Penyempurnaan skill pack (CLI 0.5.0)

- Skill baru `numa-workflow` (loop CLI, bounded context, guard, larangan `--force`, block/retry, checkpoint, kejujuran laporan) dan `numa-production` (konfigurasi, error handling, logging, health, database, CI, kontainer, dokumentasi). Skill `numa-frontend` diperluas dengan design system, pola halaman, state lengkap, aksesibilitas WCAG AA, responsif, dan checklist; `numa-security`, `numa-api-design`, `numa-tdd`, `numa-incremental` ditulis ulang lebih ketat. Backslash escape sisa template literal pada berkas skill lama dihapus.
- Lokasi pasang berubah: sumber utama `.agents/skills/` (netral agent) dan salinan `.claude/skills/`; opsi `--target agents|claude|all`. `CLAUDE.md` berisi `@AGENTS.md` bila belum ada. Logika dipindah ke `packages/cli/src/skill-pack.ts` (`installSkillPack`) agar bisa diuji.
- Guard tidak menghitung `.numa/` dan `.agents|.claude/skills/numa-*` sebagai perubahan task. Master prompt dan prompt generator task menunjuk ke `.agents/skills/` dan checklist kualitas diperluas.
- Versi CLI dan skill pack naik ke 0.5.0, sehingga `numa status` menyarankan `numa init --update` di workspace lama. Update tidak menghapus salinan lama di `.claude/skills/`; hanya menimpa skill bernama sama.
- Test CLI: 19 lulus (8 test baru untuk skill pack dan guard).

### Penyesuaian Docker dan deploy

- `.docker/api/Dockerfile`: runner berjalan sebagai `USER node` (uid 1000), bukan root. Berlaku juga untuk service api di `docker-compose.yml` dev karena memakai stage terakhir; bind mount `./node_modules` hanya dibaca.
- `.docker/web/Dockerfile`: stage runner memakai `nginxinc/nginx-unprivileged:alpine` (uid 101), tetap mendengarkan port 3455 dengan `nginx.conf` yang sama.
- `deploy.yml`: urutan baru = pull image, backup database (`pg_dump` ke `backups/` di VPS, simpan 7 terakhir; dilewati dengan peringatan bila `pg_dump` tidak terpasang), `prisma migrate deploy` lewat `docker compose run --rm --no-deps api` dari image baru, baru `up -d`. Bila migrasi gagal deploy berhenti dan container lama tetap jalan. Konsekuensi: kode lama berjalan sebentar di atas skema baru, jadi migrasi harus aditif dan kompatibel mundur.
- Belum diverifikasi dengan menjalankan container; lihat perintah uji di bawah catatan serah terima.
