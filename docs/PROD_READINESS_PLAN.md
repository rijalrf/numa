# Rencana Kesiapan Produksi Numa

Tanggal audit: 2026-10-05. Cakupan: `apps/api`, `apps/web`, `packages/cli`, Docker, CI/CD.

Status: **rencana**. Belum ada perubahan kode. Urutan pengerjaan diputuskan kemudian.

## Ringkasan

Fondasi Numa sudah baik:
- RBAC org (`requireProjectRole`, `projectWhere`) dan audit log.
- Antrean `AiJob` yang tahan restart.
- Budget token bulanan.
- Logger terstruktur dengan request id.
- Container non-root, plus backup database dan migrasi sebelum deploy.
- CI dengan type check dan test.

Masih ada celah di keamanan pembayaran, akurasi pencatatan token, operasional, dan kebersihan kode. Celah-celah itu dikelompokkan dalam fase berikut.

| Fase | Fokus | Prioritas |
|---|---|---|
| 1 | Keamanan dan integritas tagihan | P0 |
| 2 | Akurasi pencatatan token | P0 |
| 3 | Dashboard pemakaian AI (admin) | P1 |
| 4 | Operasional dan ketahanan | P1 |
| 5 | Pembersihan dead code dan dokumen | P2 |
| 6 | Optimasi system prompt per persona | P2 |
| 7 | Kualitas: test, lint, CI | P2 |
| 8 | Fitur enterprise lanjutan | P3 |

---

## Fase 1 - Keamanan dan integritas tagihan (P0) [SELESAI]

### 1.1 Webhook Midtrans idempoten
File: `apps/api/src/routes/billing.ts` (`POST /api/billing/webhook`)

**Masalah**
- Notifikasi `settlement` yang sama bisa diproses berulang. Setiap pengiriman ulang me-reset `quotaUsed` ke 0 dan memperpanjang `expiresAt` 30 hari lagi.
- `gross_amount` tidak dicocokkan dengan `payment.amount`.
- Signature dibandingkan dengan `!==`, bukan secara constant-time.
- Update `payment` dan `subscription` tidak berada dalam satu transaksi.

**Rencana**
- Proses notifikasi hanya bila `payment.status` masih `pending`. Status `success` dan `failed` bersifat final.
- Bandingkan `Number(gross_amount)` dengan `payment.amount`. Bila tidak cocok, tolak dan catat lewat `recordAudit`.
- Pakai `crypto.timingSafeEqual` untuk membandingkan signature.
- Gabungkan update `payment` dan `subscription` dalam `prisma.$transaction`, dengan kondisi `where: { id, status: 'pending' }` supaya aman dari race condition.
- Validasi body webhook dengan Zod.
- Ganti `console.*` dengan `logger`.
- Tambah test: replay notifikasi, nominal salah, signature salah.

### 1.2 Panggilan AI tanpa `projectId`
File: `apps/api/src/lib/ai/chat.ts`

**Masalah**
Empat panggilan berikut tidak mengirim `projectId`:
- `generateAppName`
- `recommendTechStack`
- `generateTreeFromPrd`
- `generateFlowFromPrd`

Karena itu `assertAiBudget` tidak bisa menentukan tenant. Budget tidak ditegakkan, dan token tidak tercatat atas nama user maupun org. Dari data lokal, sekitar 25% token jatuh ke kelompok ini. `recommendTechStack` juga tidak punya `agentName`, sehingga tercatat sebagai `ai-agent`.

**Rencana**
- Kirim `projectId`, `agentName`, dan `tier` di keempat panggilan.
- Jadikan `projectId` wajib di `GenerateJsonParams` dan opsi `generateTextStream` agar kesalahan yang sama tertangkap oleh compiler. Pengecualian harus eksplisit, misalnya `projectId: null` dengan alasan.
- Hapus nilai default `agentName = 'ai-agent'`. Semua pemanggil wajib memberi nama.

### 1.3 Rate limit bisa di-bypass
File: `apps/api/src/index.ts:45`

**Masalah**
`app.set('trust proxy', true)` membuat Express memercayai `X-Forwarded-For` dari klien mana pun. Penyerang bisa memalsukan IP untuk menghindari rate limit auth, chat, dan token.

**Rencana**
- Ganti dengan jumlah hop yang pasti, misalnya `app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1))` untuk Cloudflare Tunnel ditambah nginx.
- Bila memakai Cloudflare, utamakan header `CF-Connecting-IP`.
- Sesuaikan `trustedProxyHeaders` di Better Auth.

### 1.4 Validasi Zod di route yang belum tervalidasi
File: `routes/agent.ts`, `routes/agent-tokens.ts`, `routes/techstack.ts`, `routes/tree.ts`, `routes/checkpoints.ts`

**Masalah**
Body route-route ini dibaca langsung dari `req.body` tanpa skema. Contohnya `req.body.techStack`, `req.body?.name`, `req.body?.reason`, dan `req.body?.summary`.

**Rencana**
- Buat skema Zod per endpoint, dengan batas panjang string dan ukuran array.
- Kembalikan HTTP 400 dengan pesan berbahasa Indonesia.

### 1.5 Validasi env saat start
**Masalah**
Env wajib seperti `BETTER_AUTH_SECRET`, `DATABASE_URL`, dan `FE_URL` baru gagal ketika dipakai. `GOOGLE_CLIENT_ID` jatuh ke string kosong.

**Rencana**
- Buat `lib/env.ts` dengan skema Zod yang dipanggil paling awal di `index.ts`.
- Di produksi, proses berhenti dengan pesan jelas bila ada env wajib yang kosong.
- Provider OAuth hanya didaftarkan bila pasangan ID dan secret-nya lengkap.

### 1.6 Kerentanan dependency
Hasil `npm audit --omit=dev`:
- API: `qs`, lewat `express` (moderate, DoS).
- Web: `react-router` dan `react-router-dom` (moderate, open redirect).
- CLI: bersih.

**Rencana**
- Perbarui `express`/`qs` dan `react-router-dom` ke versi yang sudah ditambal.
- Jalankan ulang seluruh test.

### 1.7 Kebocoran pesan error
File: `apps/api/src/index.ts:153`

**Masalah**
Untuk status non-500, `err.message` dikirim apa adanya ke klien.

**Rencana**
- Hanya error yang ditandai aman (kelas `HttpError` dengan pesan untuk user) yang pesannya diteruskan.
- Error lain dibalas dengan pesan generik ditambah `requestId`.

### 1.8 Secret dan kredensial default
- Rotasi `admin123` (default `POSTGRES_PASSWORD` di `docker-compose.yml` dev) dan semua secret yang pernah tertulis di file lokal.
- Ganti default compose dev dengan `${POSTGRES_PASSWORD:?wajib diisi}`.

---

## Fase 2 - Akurasi pencatatan token (P0) [SELESAI]

Angka token dipakai untuk budget dan untuk menentukan harga paket, jadi harus benar dulu sebelum dashboard dibuat.

File: `apps/api/src/lib/ai/ai-service.ts`

| Masalah | Dampak | Rencana |
|---|---|---|
| Token dari percobaan yang gagal validasi Zod tidak dicatat. Yang dicatat hanya `usage` dari percobaan terakhir yang sukses. | Biaya retry tidak terhitung | Akumulasikan `usage` dari setiap percobaan dan catat totalnya, termasuk bila semua percobaan gagal. |
| Log kegagalan mencatat 0 token. | Panggilan gagal terlihat gratis | Catat token yang sudah terpakai. |
| Streaming PRD mencatat `inputTokens: 0` dan output ditaksir dengan rumus `panjang / 4`. | PRD tercatat jauh lebih murah | Kirim `stream_options: { include_usage: true }` dan baca `usage` dari chunk terakhir. Taksiran hanya dipakai bila provider tidak mengirim `usage`, ditandai dengan kolom `estimated`. |
| Input minimum sekitar 3.000 token, padahal prompt nama aplikasi hanya sekitar 150 token. | Diduga gateway `ai-builder` menyisipkan prompt sendiri, sekitar 2.500 token per panggilan | Cek konfigurasi gateway. Bila benar, hilangkan atau pertimbangkan dalam harga. |
| `/api/ai-metrics` dan `/api/projects/:id/ai-metrics` hanya menghitung 100 log terakhir. | Total salah | Ganti dengan `aggregate`/`groupBy` di database. |

Tambahan pada model `AiCallLog` (memerlukan migrasi):
- `tier` (`reasoning`/`cheap`) dan `promptVersion`, untuk membandingkan sebelum dan sesudah optimasi prompt.
- `estimated Boolean @default(false)`.

---

## Fase 3 - Dashboard pemakaian AI untuk admin (P1) [SELESAI]

Keputusan: hanya untuk **admin** (semua user). Metrik yang ditampilkan:
- total token dan request,
- rincian per tahap,
- per user dan per paket,
- estimasi biaya rupiah.

### 3.1 Penentuan admin
- Admin platform ditentukan lewat env berisi daftar email. Usulan nama: `PLATFORM_ADMIN_EMAILS`; nama final dikonfirmasi saat implementasi.
- Middleware baru `requirePlatformAdmin` setelah `requireUser`. Bukan admin dibalas 404 agar keberadaan endpoint tidak terlihat.
- Akses halaman dicatat dengan `recordAudit`.

### 3.2 Endpoint API
Semua endpoint menerima filter `from` dan `to` (ISO 8601, default bulan berjalan). Seluruh agregasi dilakukan di database.

| Endpoint | Isi |
|---|---|
| `GET /api/admin/usage/summary` | Total request, sukses/gagal, input/output/total token, rata-rata latensi, estimasi biaya. |
| `GET /api/admin/usage/timeseries?interval=day` | Token dan request per hari. |
| `GET /api/admin/usage/by-agent` | Per tahap (`agentName`): panggilan, token, rata-rata input/output, latensi, success rate, estimasi biaya. |
| `GET /api/admin/usage/by-user` | Per user: paket, jumlah project, token, request, estimasi biaya. Dengan paginasi. |
| `GET /api/admin/usage/by-plan` | Per paket: jumlah user aktif, token rata-rata/median/p90/maks per user dan per project, dibandingkan dengan `monthlyTokenBudget` dan harga paket. |

### 3.3 Estimasi biaya
- Harga per 1 juta token input dan output diatur per tier lewat env. Usulan nama: `AI_PRICE_INPUT_PER_MTOK_REASONING` dan seterusnya, dalam rupiah. Nama final dikonfirmasi saat implementasi.
- Bila harga belum diisi, kolom biaya menampilkan "Harga belum diatur", bukan nol.
- Bagian per paket menampilkan margin kasar: harga paket dikurangi rata-rata biaya AI per user di paket tersebut.

### 3.4 Halaman web
- Route `/admin/usage`, dengan tautan di header yang hanya muncul untuk admin. Status admin diambil dari endpoint `GET /api/user/me` atau yang setara.
- Komponen:
  - kartu ringkasan,
  - grafik harian (SVG sederhana, tanpa dependency baru kecuali disetujui),
  - tabel per tahap, per paket, dan per user,
  - filter rentang tanggal.
- Ada state loading, kosong, dan error, mengikuti pola halaman yang sudah ada.

### 3.5 Data acuan awal (lokal, 2026-09-28 s.d. 2026-10-05)
Data ini dicatat sebelum Fase 2, jadi angkanya cenderung lebih rendah dari aslinya.

| Tahap | Panggilan | Total token | Rata-rata input | Rata-rata output | Latensi |
|---|---|---|---|---|---|
| AtomicTaskArchitect | 11 | 313.481 | 19.840 | 8.659 | 81 dtk |
| SurveyRoundConsultant | 30 | 167.211 | 5.010 | 564 | 13 dtk |
| generateTreeFromPrd | 9 | 140.018 | 11.418 | 4.140 | 29 dtk |
| FeatureExecutionGraph | 8 | 90.559 | 9.891 | 1.429 | 14 dtk |
| SurveySummaryConsultant | 14 | 81.385 | 4.989 | 825 | 14 dtk |
| generateAppName | 13 | 39.838 | 3.053 | 11 | 19 dtk |
| CanonicalPrdMarkdownStream | 9 | 36.093 | 0 (tidak tercatat) | 4.010 (taksiran) | 37 dtk |
| generateFlowFromPrd | 3 | 34.865 | 10.688 | 933 | 15 dtk |
| ChangeCycleAnalyzer | 6 | 28.689 | 4.551 | 230 | 40 dtk |
| ai-agent (tech stack) | 5 | 19.305 | 3.734 | 127 | 7 dtk |

Total: 108 panggilan (8 gagal) dan 951.444 token untuk 12 project, dengan median 65 ribu dan maksimum 164 ribu token per project.

Sebagai perbandingan, budget saat ini adalah Free 300 ribu, Starter 3 juta, dan Pro 10 juta token per bulan.

---

## Fase 4 - Operasional dan ketahanan (P1) [SELESAI]

| Item | File | Rencana |
|---|---|---|
| Readiness check | `routes/health.ts` | Tambah `GET /ready` yang menjalankan `SELECT 1` ke database dan mengecek worker job. `/health` tetap ringan untuk liveness. Healthcheck compose memakai `/ready`. |
| Error tak tertangkap | `index.ts` | Tambah handler `unhandledRejection` dan `uncaughtException`: catat dengan `logger`, lalu shutdown teratur. |
| Shutdown | `index.ts:169` | Tambah `prisma.$disconnect()` setelah `server.close` dan `stopJobWorker`. |
| Logger | 40 pemakaian `console.*` | Ganti semua dengan `logger`. Tambah aturan lint `no-console` untuk `apps/api`. |
| Build API | `.docker/api/Dockerfile` | Kompilasi dengan `tsc` ke `dist/`, lalu jalankan `node dist/index.js`. Hasilnya start lebih cepat, image lebih kecil, dan tanpa `tsx` di runtime. |
| Rate limit | `index.ts:69-94` | Pindahkan penyimpanan ke Postgres atau Redis bila API dijalankan lebih dari satu instance. Tambah limit umum untuk semua `/api/*`. |
| Paginasi | 25 `findMany` di routes, hanya 9 yang memakai `take` | Tambah `take` dan cursor di endpoint daftar: projects, tasks, logs, tokens, audit. |
| Frontend error boundary | `apps/web/src/App.tsx` | Tambah ErrorBoundary di tingkat route dengan halaman fallback berbahasa Indonesia. |
| Penanganan 401 | `apps/web/src/lib/http.ts` | Bila sesi kedaluwarsa (401), arahkan ke `/login` dengan `redirect` kembali ke halaman asal. |
| Lazy loading | `apps/web/src/App.tsx` | Muat halaman dengan `React.lazy` untuk memperkecil bundle awal, terutama landing dan board. |

---

## Fase 5 - Pembersihan dead code dan dokumen (P2) [SELESAI]

### 5.1 API: fungsi dan konstanta yang tidak pernah dipanggil
- `lib/ai/chat.ts`: `generateTreeFromBrd`
- `lib/ai/prd.ts`: `generatePRDFromDiscovery`, `generateBRDFromDiscovery`, `BrdSchema`, `BrdData`
- `lib/ai/roadmap.ts`: `generateRoadmapFromBRD`
- `lib/ai/prompts.ts`: `FINALIZE_PROJECT_PROMPT`
- `lib/ai/ai-service.ts`: `generateText`. Juga bersihkan daftar nama agent BRD di baris 24 dan 32.
- `lib/zip.ts`: `_selfCheckZip`
- `lib/auth.ts`: export `SSO_ENABLED`. Periksa apakah UI login memerlukannya. Bila tidak, jadikan konstanta lokal.

### 5.2 Variabel dan import tidak terpakai
Hasil `tsc --noUnusedLocals --noUnusedParameters`:
- API:
  - `ai-service.ts:52` `provider`
  - `tasks.ts:11` `feFramework`, `tasks.ts:187-193` `beFramework`, `isSqlite`, `isTailwind`, `feEntryFiles`
  - `routes/chat.ts:46` `plan`, `routes/chat.ts:62` `req`
  - `routes/cycles.ts:13` `TaskGen`
- Web:
  - `ui/radio-group.tsx` `CheckCircle2`
  - `pages/chat.tsx` `Sparkles`
  - `pages/onboarding.tsx` `Loader2`
  - `pages/projects/board.tsx:5` (seluruh baris import)
  - `pages/projects/prd.tsx` `setError`
  - `pages/projects/survey.tsx` `Button`

Setelah dibersihkan, aktifkan `noUnusedLocals` dan `noUnusedParameters` di ketiga `tsconfig` agar tidak muncul lagi.

### 5.3 Web: file yang tidak diimpor sama sekali (622 baris)
- `components/chat/chat-bubble.tsx`
- `components/chat/chat-message-list.tsx`
- `components/chat/structured-form.tsx`
- `components/chat/typing-indicator.tsx`
- `components/ui/label.tsx`
- `components/ui/radio-group.tsx`
- `components/ui/theme-toggle.tsx`
- `components/wizard/stepper.tsx`

Sebelum dihapus, pastikan tidak ada rencana memakai komponen ini lagi.

### 5.4 Dependency tidak terpakai
- Web: `@xyflow/react`, `class-variance-authority`, `gsap`.
- Hapus dari `package.json` lalu jalankan `npm install` untuk memperbarui lockfile.

### 5.5 Export yang tidak perlu
Banyak tipe dan konstanta di-export tetapi hanya dipakai di file sendiri, misalnya `ROLES`, `AI_JOB_TYPES`, `JOB_TIMEOUT_MS`, `drainQueue`, dan tipe-tipe di `schemas.ts` dan `api-client.ts`.
- Prioritas rendah.
- Rapikan sambil lalu, atau pasang `knip` di CI untuk mendeteksinya otomatis.

### 5.6 Dokumen basi
- `AGENTS.md`: tabel AI engine menyebut `discovery.ts` dan `ui-spec.ts`, padahal keduanya sudah tidak ada. Generator interview sekarang ada di `lib/survey.ts`.
- `AGENTS.md`: modul baru belum tercantum, yaitu `cycle.ts`, `security-audit.ts`, `product-spec.ts`, `golden-stack.ts`, `stack-contract.ts`, `architecture-contract.ts`, `flow-contract.ts`, dan validator-validator.
- `AGENTS.md`: tahap `flow` (business flow) belum ada di tabel alur wizard.
- `docs/AI_CALLS_REPORT.md`: perbarui setelah Fase 2.

---

## Fase 6 - Optimasi system prompt per persona (P2) [SELESAI, DENGAN CATATAN]

> Status 2026-10-06: selesai: `PROMPT_VERSIONS` untuk semua 13 panggilan AI (dicatat di `AiCallLog.promptVersion`, tampil sebagai kolom "Versi prompt" di `/admin/usage`), prompt nama aplikasi, tech stack (dari golden pack, tanpa placeholder), tree, persona PRD, dan input Tasks diperkecil sekitar 40% pada fixture uji (`buildTasksPrompt` dipisah sebagai fungsi murni dan diuji: markdown PRD utuh tidak lagi dikirim bersama daftar terstruktur yang sama, JSON dikompakkan).
> Keputusan: prompt tetap di dekat generatornya (kohesi), katalog pusat hanya untuk versi; tidak dipindah ke folder `prompts/`. Aturan per stack di Tasks tidak dipangkas (system prompt hanya sekitar 3.800 karakter; beban utama ada di PRD).
> Belum: evaluasi regresi 5-10 ide uji dengan panggilan AI nyata. Bandingkan rata-rata input/output, latensi, dan skor `task-quality` per versi prompt di `/admin/usage`.

### 6.1 Penilaian persona saat ini

| Tahap | Lokasi | Persona | Penilaian |
|---|---|---|---|
| Interview | `lib/survey.ts:63` | Konsultan Produk | Sesuai. Adaptif per putaran. |
| Ringkasan survey | `lib/survey.ts:123` | Konsultan Produk senior | Sesuai. Juga menghasilkan `name`, sehingga dobel dengan `generateAppName`. |
| Nama aplikasi | `lib/ai/chat.ts:80` | "penamaan produk profesional" | Kalimat persona janggal. Tidak menyebut kunci JSON `name`. Tanpa `projectId`. |
| Tech stack | `lib/ai/prompts.ts:7` | Arsitek Software senior | Placeholder `{appName}`, `{ideaAndFeatures}`, `{targetAndScale}` tidak pernah diisi. Prompt memaksa SQLite + React, padahal hasilnya dinormalisasi ke golden pack. Tanpa `agentName`, `projectId`, dan `tier`. |
| PRD | `lib/ai/prd.ts:175` | Arsitek Software | Kurang tepat. PRD adalah dokumen produk; lebih cocok Product Manager senior dengan kemampuan analisis sistem untuk bagian data model dan API. |
| Tree | `lib/ai/prompts.ts:30` | Desainer Sistem | Sesuai. Placeholder `{appName}` dan `{prdContent}` tidak diisi. PRD dikirim penuh lewat `JSON.stringify`. |
| Business flow | `lib/ai/prompts.ts:78` | Analis Proses Bisnis | Sesuai dan paling rapi (aturan jelas, ada contoh). |
| Roadmap | `lib/ai/roadmap.ts:32` | Desainer Sistem | Sesuai. |
| Tasks | `lib/ai/tasks.ts:205` | Tech Lead senior | Persona sesuai, tetapi prompt sekitar 12.700 karakter (sekitar 3.500 token), dengan rata-rata input 19.840 dan output 8.659 token, dan latensi 81 detik. Penyumbang token terbesar (33%). |
| Security audit | `lib/ai/security-audit.ts:50` | AppSec Engineer | Sesuai. |
| Change cycle | `lib/ai/cycle.ts:93` | Tech Lead senior | Sesuai. |
| Product spec | `lib/ai/product-spec.ts:82` | Analis sistem | Sesuai. |

### 6.2 Rencana optimasi
1. **Satu katalog prompt.** Pindahkan semua system prompt ke `lib/ai/prompts/` (satu file per tahap). Setiap prompt diberi `PROMPT_VERSION` yang dicatat di `AiCallLog.promptVersion` (Fase 2).
2. **Struktur seragam:** Peran, Tujuan, Input, Aturan wajib, Larangan, Format output (skema JSON), Contoh singkat.
3. **Bagian statis di depan.** Instruksi tetap ditaruh di `system` dan data dinamis di `user`, supaya prompt caching provider bisa bekerja. Hapus placeholder `{...}` yang tidak pernah diisi.
4. **Tasks:**
   - Kirim hanya requirement PRD dan entitas `product spec` yang relevan untuk fitur yang sedang dipecah, bukan PRD penuh.
   - Pindahkan aturan per stack ke kontrak arsitektur yang disisipkan sesuai stack terpilih.
   - Target: turunkan input setidaknya 40% tanpa menurunkan skor `task-quality`.
5. **Tree dan Flow:** gunakan ringkasan `product spec` sebagai input utama, bukan PRD JSON penuh.
6. **PRD:** ganti persona menjadi Product Manager senior. Tetap pertahankan aturan ID requirement.
7. **Nama aplikasi:** hapus panggilan `generateAppName` dan pakai `name` dari ringkasan survey, atau perbaiki prompt-nya bila nama memang dibutuhkan sebelum survey. Dipilih saat implementasi.
8. **Tech stack:** prompt diselaraskan dengan daftar golden pack, sehingga model memilih dari daftar, bukan bebas.
9. **Evaluasi regresi:** buat 5-10 ide contoh sebagai set uji tetap. Bandingkan token, latensi, skor `task-quality`, dan validator sebelum dan sesudah perubahan prompt.

---

## Fase 7 - Kualitas: test, lint, CI (P2) [SELESAI, DENGAN CATATAN]

> Status 2026-10-06: selesai: ESLint, knip, CI (audit prod, lint, dead code, build API), `createApp()` dipisah dari `listen`, 9 test HTTP supertest (gerbang auth, 404 admin, body rusak/413, CORS, `/ready`, webhook), test `http.ts` dan `ai-job.ts` di web, test platform-admin dan prompt Tasks.
> Belum: test route berbasis database (RBAC per peran, webhook dengan order nyata) yang memerlukan Postgres sementara di CI, dan e2e `scripts/test-e2e-wizard.ts` (memakai AI nyata, dijalankan manual sebelum rilis).

- **Test HTTP route:** pakai `supertest` untuk RBAC, webhook billing, agent API, dan endpoint admin usage. Saat ini 15 file test, kebanyakan di level lib.
- **Test web:** saat ini 7 test. Tambah test untuk `http.ts`, `ai-job.ts`, guard route, dan halaman admin usage.
- **Lint:** ESLint dan Prettier di ketiga paket, dijalankan di CI.
- **CI** `.github/workflows/ci.yml`: tambah langkah `npm audit --omit=dev --audit-level=high`, lint, dan `knip` atau pemeriksaan dead code.
- **E2E:** jalankan `scripts/test-e2e-wizard.ts` terhadap database sementara di CI, atau minimal sebelum rilis.

---

## Fase 8 - Fitur enterprise lanjutan (P3)

Keterbatasan yang sudah tercatat sebelumnya:
- Billing per organisasi. Saat ini langganan melekat ke user.
- UI pengelolaan SSO OIDC, serta SCIM/SAML.
- Restore versi artefak dari `ArtifactVersion` lewat UI.
- Pembatalan job AI yang benar-benar menghentikan panggilan model. Saat ini pembatalan bersifat kooperatif.
- Kebijakan retensi `AiCallLog` dan `AuditLog`, termasuk arsip atau hapus otomatis setelah N bulan.
- Riwayat pembayaran tetap tersimpan saat akun dihapus, sesuai kewajiban pajak dan akuntansi.

---

## Catatan pelaksanaan

- Setiap fase dikerjakan terpisah dan diverifikasi:
  - `npx tsc --noEmit -p .` dan `npm test` di paket terkait,
  - build Docker dijalankan manual oleh pemilik.
- Perubahan schema Prisma (Fase 2) memerlukan migrasi baru dan `prisma migrate deploy` saat deploy.
- Nama env dan nama file baru di rencana ini masih usulan dan dikonfirmasi sebelum implementasi.
