# Laporan Perubahan dan Optimasi Numa

Periode: 2026-10-05 sampai 2026-10-06. Sumber rinci per fase: [PROD_READINESS_PLAN.md](PROD_READINESS_PLAN.md).

Status (2026-10-06): seluruh perubahan sudah di `main` (commit `6426bdc` dan `87df1a2`), CI lolos, dan deploy ke VPS berhasil setelah `.env` server dilengkapi (`POSTGRES_PASSWORD` kini wajib). CLI `numa-cli` 0.5.0 dipublish manual oleh pemilik (cek `npm view numa-cli version` untuk memastikan 0.5.0 sudah tampil).

## 1. Ringkasan

| Fase | Fokus | Status |
|---|---|---|
| 1 | Keamanan dan integritas tagihan | Selesai |
| 2 | Akurasi pencatatan token | Selesai |
| 3 | Dashboard pemakaian AI (admin) | Selesai |
| 4 | Operasional dan ketahanan | Selesai |
| 5 | Pembersihan dead code dan dokumen | Selesai |
| 6 | Optimasi system prompt per persona | Selesai dengan catatan |
| 7 | Kualitas: test, lint, CI | Selesai dengan catatan |
| 8 | Fitur enterprise lanjutan | Ditunda |
| Tambahan | Uji e2e dengan AI nyata dan pemangkasan prompt | Selesai |

## 2. Keamanan dan tagihan (Fase 1)

- Webhook pembayaran idempoten: hanya memproses pembayaran berstatus `pending`, mencocokkan nominal dengan nominal pembayaran, memverifikasi keaslian secara constant-time, dan memperbarui `payment` serta `subscription` dalam satu transaksi. Gateway kini Mayar.id (lihat bagian 2b). Sebelumnya, notifikasi yang dikirim ulang bisa mereset kuota dan memperpanjang langganan berulang.
- Semua panggilan AI kini membawa `projectId` dan `agentName` sehingga budget token bulanan benar-benar ditegakkan (sebelumnya sekitar 25% token tidak terikat tenant).
- `trust proxy` tidak lagi `true` (rate limit bisa dipalsukan lewat `X-Forwarded-For`); jumlah hop diatur lewat `TRUST_PROXY_HOPS`.
- Validasi Zod ditambahkan di route agent, agent-tokens, techstack, tree, dan checkpoints.
- Validasi env saat startup (`env.ts`, `env-check.ts`): gagal cepat bila env wajib kosong.
- Pesan error internal tidak lagi bocor ke klien (`HttpError`, `toClientError`).
- Dependensi rentan diperbarui (`express`/`qs`, `react-router-dom`).

## 2b. Migrasi pembayaran ke Mayar.id

Midtrans diganti Mayar.id (API V2). Rencana lengkap dan hasil riset dokumentasi ada di [MAYAR_MIGRATION_PLAN.md](MAYAR_MIGRATION_PLAN.md).

- `lib/mayar.ts` (baru): klien Mayar (`createPaymentRequest`, `getTransaction`), konfigurasi dari env, verifikasi token webhook constant-time, dan klasifikasi status. `lib/midtrans.ts` dihapus.
- Checkout membuat Single Payment Request (`POST /hl/v2/payments/create`), masa berlaku tagihan 24 jam. Klik ganda memakai ulang tagihan yang masih berlaku. Respons tetap `{ redirectUrl }`, ditambah `paymentId`.
- Webhook (`POST /api/billing/webhook`) memeriksa header `X-Callback-Token`, lalu **tidak memercayai isi payload**: status dan nominal selalu diambil ulang dari `GET /hl/v2/transactions/{id}`. Tanpa `MAYAR_API_KEY` atau `MAYAR_WEBHOOK_TOKEN`, webhook menjawab 503. Gagal konfirmasi ke Mayar dijawab 502 agar Mayar mengirim ulang.
- Endpoint baru `POST /api/billing/payments/:id/sync` (login): rekonsiliasi saat pengguna kembali dari halaman bayar, untuk kasus webhook terlambat atau hilang. Halaman `/settings/billing` membaca `?payment=<id>` dan menampilkan status (berhasil, menunggu dengan tombol "Cek ulang", kedaluwarsa).
- Model `Payment` netral terhadap gateway: `midtransId` menjadi `providerRef`, ditambah `provider`, `providerTxId`, `checkoutUrl`, `expiresAt` (migrasi `20261006000000_payment_provider_neutral`; baris lama berlabel `midtrans`).
- Env baru: `MAYAR_API_KEY`, `MAYAR_WEBHOOK_TOKEN`, `MAYAR_IS_PRODUCTION` (diteruskan di `docker-compose.prod.yml`, opsional agar deploy tidak gagal sebelum akun siap).
- Tes: 11 unit test `lib/mayar` dan 7 tes HTTP billing. Alur webhook diverifikasi ke DB lokal dengan Mayar dimock: belum bayar tetap `pending`, nominal salah ditolak 400, bayar sah mengaktifkan paket sekali, kiriman ulang dan paralel aman.
- Belum diverifikasi ke Mayar sungguhan (dokumentasi resmi tidak menjelaskan): nama header token webhook (diasumsikan `X-Callback-Token`), field id di payload webhook (kode mencocokkan `data.transactionId`, `data.id`, dan `data.paymentLinkId`), dan penerimaan `redirectUrl` pada payment request (bila ditolak 400, kode mengulang tanpa `redirectUrl`). Wajib dicek di sandbox UAT sebelum go-live.

## 3. Akurasi token (Fase 2)

- Token dari setiap percobaan (termasuk retry dan yang gagal) kini diakumulasi dan dicatat.
- Streaming PRD membaca `usage` asli dari provider; taksiran hanya cadangan.
- `AiCallLog` mendapat kolom `tier`, `promptVersion`, dan `estimated` (migrasi baru).
- `/api/ai-metrics` memakai agregasi database, bukan 100 log terakhir.

## 4. Dashboard pemakaian AI (Fase 3)

- Halaman `/admin/usage` dan endpoint `/api/admin/usage/*` (ringkasan, deret waktu, per tahap, per user, per paket), hanya untuk email di `PLATFORM_ADMIN_EMAILS` (non-admin mendapat 404).
- Estimasi biaya rupiah dari `AI_PRICE_*`; bila harga belum diisi tampil "Harga belum diatur".
- Kolom "Versi prompt" untuk membandingkan sebelum dan sesudah optimasi.

## 5. Operasional (Fase 4) dan kualitas (Fase 7)

- `/ready` (cek database dan worker antrean), handler `unhandledRejection`/`uncaughtException`, shutdown yang memutus Prisma.
- Seluruh `console.*` di API diganti logger terstruktur; ESLint melarang `console.*`.
- API dibangun dengan `tsc` dan dijalankan `node dist/index.js` (tanpa `tsx` di produksi).
- ErrorBoundary, penanganan 401 dengan redirect, dan lazy loading di web.
- CI: audit dependensi produksi, lint, dead code (knip), typecheck, build API, test.
- Test: `createApp()` dipisah dari `listen`, 9 test HTTP supertest, test `http.ts` dan `ai-job.ts` di web, test platform-admin dan prompt Tasks.

## 6. Pembersihan (Fase 5)

- Fungsi, variabel, dan file tidak terpakai dihapus (termasuk komponen chat lama, `label`, `radio-group`, dan dependensi web yang tidak dipakai).
- `noUnusedLocals` dan `noUnusedParameters` diaktifkan.
- `AGENTS.md` sudah diperbarui (2026-10-06) dengan versi prompt terbaru, polling 120 percobaan, dan alur survey. `docs/AI_CALLS_REPORT.md` adalah spesifikasi desain, bukan daftar versi, jadi tidak diubah.

## 7. Optimasi prompt (Fase 6 dan sesi pengujian)

Semua panggilan AI kini punya versi di `PROMPT_VERSIONS`. Prompt nama aplikasi, tech stack (dari golden pack), persona PRD (Product Manager), dan input Tasks diperkecil sekitar 40%.

Pada sesi e2e, prompt tree, flow, dan product spec dipangkas lebih lanjut:

- Tree dan flow hanya menerima markdown PRD (helper `prdTextForPrompt`), tanpa spec dan indeks requirement.
- Product spec hanya mengirim bagian PRD yang relevan (`selectSpecSections`), dengan fallback ke markdown utuh; ditambah 2 tes.
- Polling UI untuk job AI dinaikkan dari 60 ke 120 percobaan (6 menit).

Hasil terukur dengan AI nyata (e2e run 2 dibanding run 3):

| Tahap | Token masuk | Latensi |
|---|---|---|
| Flow (`flow@2`) | 25,7 rb menjadi 11,0 rb (turun sekitar 57%) | 107 dtk menjadi 31 dtk |
| Tree (`tree@3`) | 12,7 rb menjadi 10,7 rb (turun sekitar 16%) | 41 dtk menjadi 50 dtk |
| Product spec (`product-spec@2`) | 22,6 rb menjadi 19,9 rb (turun sekitar 12%) | 94 dtk menjadi 93 dtk |

Catatan: PRD run 2 dan run 3 berbeda, jadi perbandingan tidak sepenuhnya setara. Penghematan tree dan product spec lebih kecil dari perkiraan awal.

## 7b. Survey dimulai dari proses existing

- Putaran 1 survey kini bertema "Proses Saat Ini & Masalah Utama". Pertanyaan pertama wajib tentang cara kerja sebelum ada aplikasi (alat atau cara yang dipakai, pihak yang terlibat, langkah, titik yang merepotkan). Pengguna utama tetap dicakup.
- Ringkasan survey punya bagian baru "Proses Saat Ini (As-Is)", yang ikut menjadi dasar PRD.
- Label tahap di UI (`survey-progress.tsx`) menjadi "Proses Saat Ini & Masalah".
- Versi prompt naik ke `survey-round@3` dan `survey-summary@2`.
- Temuan tes manual (project `cmuwbsnu2000513hebdzhrl0p`): pertanyaan memakai istilah "sirkulasi" yang diambil mentah dari ide pengguna dan menggabungkan dua topik. Prompt putaran survey kini mewajibkan bahasa sehari-hari (istilah khusus diganti atau diberi arti), satu pertanyaan satu hal, dan pilihan konkret untuk cara kerja saat ini (`survey-round@3`).
- Belum diuji dengan AI nyata; hanya typecheck, test, dan lint yang lolos. Proyek lama tidak berubah karena pertanyaannya sudah tersimpan.

## 7c. Konteks task untuk agent (`numa context`)

Endpoint `GET /api/agent/tasks/:id/context` kini menyusun konteks yang dipersempit per task lewat `apps/api/src/lib/task-context.ts` (fungsi murni, diuji di `lib/__tests__/task-context.test.ts`):

- Requirement: bukan lagi sekadar ID dan judul. Deskripsi penuh blok FR/PR/BR dari markdown PRD (beserta sub-butir) ikut dikirim, ditambah edge case (EC) yang menyebut requirement task dan journey terkait dari spec.
- Endpoint dan model data difilter per task: kontrak milik task, `consumesApis`, endpoint PRD yang melayani requirement task, lalu kecocokan nama resource. Kontrak aktual dari task selesai menggantikan kontrak rencana PRD (requirementIds tetap dipertahankan). Model data dipilih dari kecocokan nama pada teks task dan endpoint terpilih, plus relasi satu langkah. Task DATABASE/BACKEND tanpa kecocokan jatuh ke model awal dengan penanda; layer lain tidak menampilkan model.
- Struktur file proyek berasal dari `changedFiles` laporan guard task DONE (kondisi repo nyata), bukan dari `files_to_create` rencana. Lockfile dan `node_modules/dist` disaring. File yang disebut task didahulukan. Bila belum ada laporan guard sama sekali, daftar rencana ditampilkan dengan label belum terverifikasi.
- Ringkasan kontrak arsitektur (lapisan, larangan, format error) selalu ikut di konteks; versi lengkap tetap di `/api/agent/architecture-contract`.
- Batas yang masih ada: pencocokan model dan endpoint berbasis kata (heuristik), jadi PRD dengan penamaan campur bahasa Indonesia/Inggris bisa meleset; edge case hanya muncul bila teksnya menyebut ID requirement. Belum diuji dengan database dan task nyata; yang lolos hanya typecheck, test (121), lint, dan deadcode.

## 7d. Tree dihapus, journey di PRD diperluas (2026-10-06)

Rencana dan keputusan: [JOURNEY_MIGRATION_PLAN.md](JOURNEY_MIGRATION_PLAN.md). Tahap yang sudah dikerjakan di kode:

- Tree dihapus dari wizard, API, dan web. Wizard menjadi 7 tahap (chat, survey, techstack, prd, board, guide, done). Setelah PRD selesai, `wizardStep` langsung `board`. `tree` dihapus dari `STAGE_ORDER` (tanpa alias; data lama akan di-truncate pemilik). Job `tree_generate`, route `/tree`, `generateTreeFromPrd`, prompt `tree@3`, `TreeDataSchema`, halaman web beserta komponen dan hook tree, serta layout swimlane dihapus. Dependensi `dagre` dan `@types/dagre` ikut dicabut dari `apps/web`.
- Flow tidak lagi digenerate di wizard dan UI-nya dihapus. Endpoint `POST /api/projects/:id/flow/generate` dan `GET /api/projects/:id/flow` dipindah ke `routes/flow.ts` dan dipertahankan hanya untuk uji pembanding. Bila project punya `BusinessFlow`, kontrak flow lama tetap dipakai; bila tidak, skenario E2E disusun dari journey.
- Journey di spec PRD diperluas: `kind` (`main` atau `failure`) dan `branchFrom` (`{ journey, stepIndex }`). Prompt ekstraksi naik ke `product-spec@3` dan kini ikut membaca bagian Edge Cases. Tidak ada panggilan AI baru.
- `lib/ai/journey-contract.ts` (baru): menyusun skenario dari journey (jalur gagal = langkah utama sampai titik cabang + langkah jalur gagal), menyuntiknya ke task INTEGRATION, dan memeriksa cakupan requirement per journey (warning `JOURNEY_REQ_UNCOVERED`, tidak memblokir). Prompt task naik ke `tasks@3` (label blok skenario kini generik).
- Halaman PRD menampilkan daftar journey (utama beserta jalur gagal yang bercabang) lewat `components/prd/journey-list.tsx`.
- Temuan koreksi: parameter `tree` di `analyzeChangeRequest` (cycle) tidak pernah diisi pemanggil; parameter mati itu dihapus tanpa perubahan perilaku.
- Skrip e2e (`scripts/test-e2e-wizard.ts`): langkah tree diganti pengecekan journey dan skenario E2E pada task INTEGRATION.
- Verifikasi lokal: typecheck, lint, deadcode, build semua workspace, dan test API (126) serta web (10) lolos. E2E dengan AI nyata (`scripts/test-e2e-wizard.ts`) lulus penuh pada 2026-10-06: 3 journey utama dan 3 journey gagal dengan `branchFrom` valid, 14 task, skenario E2E (S1-S6) tersuntik ke task INTEGRATION, tanpa temuan `JOURNEY_*`. Satu run: 14 panggilan AI, 140,6 rb token. Ekstraksi spec (`product-spec@3`) tercatat 27,7 rb token karena 1 retry Zod (sekitar 13,9 rb per percobaan, setara `product-spec@2`); tingkat retry perlu dipantau di beberapa run. Temuan 7 error di laporan validasi seluruhnya `SEC_*` dari audit keamanan task (perilaku lama, bukan dari journey). Perbandingan dengan dan tanpa flow (langkah 3) belum dilakukan.
- Belum dikerjakan: uji pembanding task INTEGRATION dengan dan tanpa flow, penghapusan flow (kode, tabel `TreeNode` dan `BusinessFlow` lewat migrasi), serta bagian landing page yang masih menyebut tahap Flow.

### Total token satu project (dari log e2e 2026-10-06)

Sisi Numa, dari idea sampai semua task siap (9 panggilan AI, 1 putaran survey): sekitar **108 rb token**.

| Tahap | Token |
|---|---|
| Nama app, survey 1 putaran, ringkasan survey | 15,4 rb |
| Tech stack | 4,1 rb |
| PRD | 11,3 rb |
| Ekstraksi spec (journey) | 27,7 rb (13,9 rb per percobaan, ditambah 1 retry) |
| Roadmap | 10,9 rb |
| Generate task | 25,3 rb |
| Audit keamanan task | 13,6 rb |

- Tiap putaran survey tambahan sekitar 5,4 sampai 7,3 rb. Dengan 6 putaran, total sekitar 138 rb (perkiraan). Run sebelum tree dan flow dihapus: sekitar 171 rb dengan 6 putaran.
- Change request di akhir e2e (opsional, bukan pipeline dasar): 5 panggilan, sekitar 32 rb.
- Token eksekusi oleh AI coding agent (14 task) tidak terukur: dipakai di sisi agent user dan tidak tercatat di `AiCallLog`. Untuk mengetahuinya, jalankan satu project sampai selesai dan catat pemakaian dari sisi agent.
- Basis angka: satu run, jadi taksiran kasar. Tingkat retry ekstraksi spec masih perlu dipantau.

## 8. Uji end-to-end nyata

- Migrasi dev diterapkan (7 migrasi, data 13 project dev tidak disentuh).
- E2E dengan AI nyata lolos penuh: survey, paywall, tech stack, PRD, tree, flow, tasks, ekspor ZIP, token CLI, loop agent, architecture contract, change request. Run 3: 13 task, 78 node tree, 16 panggilan, 130,6 rb token masuk dan 36,7 rb keluar.
- `scripts/test-e2e-wizard.ts`: dukung `E2E_API_BASE`, timeout polling 300 detik.
- Database `numa_e2e` sudah di-drop; `apps/api/dist` sudah dihapus.

## 9. Temuan terbuka

- Product spec selalu retry 1 kali dan penyebabnya belum terbukti, karena alasan gagal per percobaan tidak dicatat.
- Tasks (96 dtk, output 9,5 rb token) dan product spec (93 dtk) adalah tahap terlama.
- Tech stack yang direkomendasikan AI ditimpa skrip e2e dengan stack tetap, jadi tasks dari stack pilihan AI belum teruji.
- `recommendTechStack` masih mengirim `JSON.stringify(prd.content)` (belum dipangkas).
- Belum dikerjakan dari Fase 6 dan 7: evaluasi regresi 5-10 ide, pemangkasan aturan per stack di Tasks, test route berbasis database, e2e di CI.
- Gateway `ai-builder` diduga menyisipkan prompt sendiri (input minimum sekitar 3.000 token); perlu dicek.
- Password contoh di `README.md:173` sudah diganti `GANTI_PASSWORD`. Password lama tetap harus dirotasi karena sudah ada di riwayat git.

## 10. Tindakan sebelum rilis produksi (sisa)

1. Jalankan `prisma migrate deploy` di produksi.
2. Rotasi `admin123` dan secret lain yang pernah tertulis di file lokal.
3. Isi `PLATFORM_ADMIN_EMAILS`, `AI_PRICE_*`, dan `TRUST_PROXY_HOPS`.
4. Pasang `postgresql-client` di VPS dan atur backup Postgres.
5. Build ulang image Docker, lalu publish CLI bila diperlukan (keduanya manual).
6. Putuskan cara commit (per fase atau satu commit).

## 11. Panduan tes manual UI

Tujuan: memastikan perubahan sesi ini berjalan dari sisi pengguna. Web di `http://localhost:3455`, API di port 6655.

### 11.1 Persiapan

1. Image web yang berjalan mungkin dibangun sebelum perubahan terbaru. Bangun ulang bila ingin menguji prompt dan polling baru:
   ```
   docker compose up -d --build
   ```
2. Migrasi dev sudah diterapkan, tidak perlu migrasi lagi.
3. Untuk menguji dashboard admin, isi `PLATFORM_ADMIN_EMAILS` di `.env` API dengan email akun uji, lalu mulai ulang API. Untuk melihat biaya rupiah, isi juga `AI_PRICE_INPUT_PER_MTOK_REASONING`, `AI_PRICE_OUTPUT_PER_MTOK_REASONING`, dan padanan `CHEAP`.
4. Pakai akun baru (daftar di `/login`) agar mulai dari paket Free Trial.

Batas paket (dari `billing.ts`):

| Paket | Proyek aktif | Putaran survey | Batas karakter ide | Budget token bulanan (default) |
|---|---|---|---|---|
| Free Trial | 1 | 1 | 1000 | 300 rb |
| Starter | 2 | 3 | 2000 | 3 juta |
| Pro | 5 | 4 | 4000 | 10 juta |

### 11.2 Alur wizard (jalur utama)

| No | Langkah | Hasil yang diharapkan |
|---|---|---|
| 1 | Buka `/chat`, tulis ide aplikasi (kurang dari 1000 karakter), lanjutkan | Proyek dibuat dengan tahap survey. Nama sementara dipotong dari ide, lalu berganti nama hasil AI beberapa detik kemudian. |
| 2 | Di `/projects/:id/survey`, tunggu putaran 1 | Muncul 3 pertanyaan dengan saran Numa. Jawab atau pakai saran. |
| 3 | Selesaikan putaran 1 | Ringkasan produk tampil. Pada Free Trial tidak ada putaran lanjutan. |
| 4 | Coba lanjut ke PRD saat masih Free Trial | Ditolak dengan dialog upgrade (HTTP 403 `plan_upgrade_required`). Ini perilaku yang benar. |
| 5 | Upgrade ke Starter lewat `/settings/billing` | Diarahkan ke halaman bayar Mayar (sandbox), bayar lewat simulasi, lalu kembali ke `/settings/billing` dengan status "Pembayaran berhasil" (atau ubah paket langsung di DB untuk uji lokal). Tahap berpindah ke tech stack. |
| 6 | Di `/techstack`, tunggu rekomendasi AI | Rekomendasi hanya dari golden pack (frontend, backend, database, styling, testing). Pilihan manual di luar daftar ditolak (400). |
| 7 | Di `/prd`, generate PRD | PRD mengalir (SSE) dan memuat ID `FR-xxx` dan `PR-xxx`. Ekspor `.md` bisa diunduh. |
| 8 | Di `/tree`, generate tree | Job berjalan sekitar 1-2 menit (tree lalu flow). UI tidak timeout (batas 6 menit). Hasil: hierarki App, Fitur, Sub-fitur, dan diagram alur swimlane. |
| 9 | Di `/board`, generate task | Kanban terisi atomic task. Periksa tiap task punya file boleh dan dilarang, acceptance criteria, dan dependensi. |
| 10 | Unduh ZIP dari halaman board atau guide | ZIP terunduh dan berisi PRD dan task. |
| 11 | Buat token agent, jalankan `numa login`, `numa next`, `numa context`, `numa done` | Loop CLI berjalan, status task di board ikut berubah. |
| 12 | Ajukan change request (survey perubahan) | Tahap kembali ke tech stack dan delta PRD diproses. |

### 11.3 Yang diubah sesi ini dan cara mengecek

| Area | Cara mengecek |
|---|---|
| Polling job AI 120 percobaan | Saat generate tree, jangan tutup halaman. Tidak boleh muncul pesan timeout sebelum 6 menit. |
| Flow lebih cepat (`flow@2`) | Dari log API atau `/admin/usage`, panggilan `generateFlowFromPrd` sekitar 30 detik dengan token masuk sekitar 11 rb. |
| Webhook idempoten | Kirim ulang notifikasi `settlement` yang sama. Kuota dan `expiresAt` tidak boleh berubah setelah yang pertama. |
| Budget token | Turunkan `AI_TOKEN_BUDGET_FREE` sementara ke nilai kecil, lalu generate. Harus muncul penolakan eksplisit, bukan hasil kosong. |
| Error tidak bocor | Akses endpoint dengan body rusak. Respons berpesan generik dan memuat `requestId`. |

### 11.4 Dashboard admin `/admin/usage`

1. Login dengan email yang ada di `PLATFORM_ADMIN_EMAILS`. Menu "Pemakaian AI" muncul di dropdown profil (di bawah "Langganan & Paket").
2. Login dengan akun non-admin lalu buka `/admin/usage` langsung. Halaman harus tampil sebagai tidak ditemukan (404), bukan akses ditolak.
3. Sebagai admin, periksa: kartu ringkasan (total token, request, sukses/gagal, latensi), grafik harian, tabel per tahap, per paket, per user, dan kolom "Versi prompt".
4. Ubah rentang tanggal. Angka harus berubah mengikuti filter.
5. Bila `AI_PRICE_*` belum diisi, kolom biaya menampilkan "Harga belum diatur", bukan 0.
6. Cocokkan: total token halaman ini sebanding dengan jumlah panggilan AI yang baru Anda jalankan, termasuk panggilan PRD (input tidak lagi 0).

### 11.5 Kasus tepi

| Kasus | Yang diharapkan |
|---|---|
| Ide lebih dari 1000 karakter di Free Trial | Ditolak dengan pesan batas karakter. |
| Buat proyek kedua di Free Trial | Ditolak: "Kuota proyek tercapai". |
| Sesi habis (hapus cookie) lalu buka halaman proyek | Diarahkan ke `/login`, dan setelah login kembali ke halaman asal. |
| Tahap yang sudah dilewati | Terkunci read-only. Mutasi dibalas 403. |
| Matikan API saat generate lalu nyalakan lagi | Job tetap berlanjut atau gagal dengan pesan eksplisit (antrean `AiJob` tahan restart, job macet lebih dari 10 menit otomatis ditandai gagal). |
| Gangguan AI | Pesan error eksplisit (HTTP 502). Tidak ada hasil tiruan. |

### 11.6 Yang perlu dicatat saat tes

- Tahap yang terasa lambat, dan berapa detik.
- Setiap pesan error yang muncul, beserta `requestId`-nya.
- Setiap tulisan, tombol, atau ikon yang tampak janggal (aturan proyek: Bahasa Indonesia penuh dan tanpa emoji).
- Hasil tes ini sebelum memutuskan commit dan rilis.

## 12. Status rilis dan sisa pekerjaan

- Deploy: workflow `Deploy Numa to VPS` pada `main` memverifikasi (audit, lint, dead code, typecheck, test), membangun image, lalu deploy dan migrasi. Run pertama gagal di langkah 4 karena `POSTGRES_PASSWORD` kosong di `.env` VPS; setelah diisi, run ulang berhasil.
- Audit dependensi menangkap advisory kritis baru di `proxy-addr`; diperbaiki dengan memperbarui ke 2.0.8.
- Gateway pembayaran sudah diganti ke Mayar.id (bagian 2b), kode siap tetapi belum di-deploy dan belum diuji ke Mayar sungguhan. Sampai `MAYAR_API_KEY` dan `MAYAR_WEBHOOK_TOKEN` diisi di `.env` VPS dan URL webhook `https://numa.opendv.xyz/api/billing/webhook` didaftarkan di dashboard Mayar, checkout dan webhook menjawab 503. Langkah uji sandbox ada di [MAYAR_MIGRATION_PLAN.md](MAYAR_MIGRATION_PLAN.md) bagian 6.
- `.mcp.json` sengaja tidak di-commit.
- Password lama database tetap ada di riwayat git; rotasi masih diperlukan.
- Domain server UAT: `https://numa.opendv.xyz` (domain lama `numa.mrijal.my.id` sudah dihapus dari README, AGENTS.md, docs, dan `.env.example`). Di `.env` VPS, `FE_URL`, `BETTER_AUTH_URL`, dan `VITE_API_URL` harus memakai domain ini. Teks README paket CLI ikut berubah, jadi baru tampil di npm setelah CLI dipublish ulang.

## 13. Wizard 1 (Chat): issue #51, #52, #53 (2026-10-08)

Induk: #54. Belum di-commit pada saat catatan ini ditulis.

- **#53 Submit ide satu request.** `POST /api/chat/finalize` (body `{ idea }`) membuat `ChatSession` (langsung `finalized`), pesan arsip, dan `Project` dalam satu transaksi, membalas 201 `{ projectId }`. Kuota project dicek sekali di route; panjang ide kini divalidasi terhadap `charLimit` paket (sebelumnya hanya dicek di endpoint pesan yang dihapus). Endpoint dihapus: `POST /api/chat/sessions`, `GET|POST /api/chat/sessions/:id/messages`, `POST /api/chat/sessions/:id/retry`, `POST /api/chat/sessions/:id/finalize`. `aiRateLimiter` tidak lagi di `/api/chat/sessions`; kini dipasang di `survey/generate` dan `survey/submit` yang memicu job AI. Halaman `chat.tsx`, `scripts/test-e2e-wizard.ts`, `real-test-invtrack.ts`, `real-test-minitask.ts`, dan tes HTTP disesuaikan.
- **#52 Nama aplikasi tanpa panggilan AI terpisah (opsi A).** Survey putaran 1 menghasilkan `appName` di output yang sama; job `chat_finalize`, `postFinalizeProject`, `APP_NAME_PROMPT`, dan `PROMPT_VERSIONS.appName` dihapus. Nama project hanya diganti bila masih sama dengan nama sementara (`draftProjectName`, potongan ide). Versi prompt `survey-round@3` naik ke `survey-round@4`. Uji nyata ke gateway: nama "Kasir Kelontong" dari ide warung kelontong, satu panggilan AI per project baru berkurang.
- **#51 Pemantauan reasoning token.** Kolom baru `AiCallLog.reasoningTokens` (migrasi `20261008000000_ai_call_log_reasoning_tokens`) diisi dari `completion_tokens_details.reasoning_tokens`. Env opsional `OPENAI_REASONING_EFFORT_CHEAP` dan `OPENAI_REASONING_EFFORT_REASONING` (low|medium|high); kosong berarti parameter tidak dikirim.
  - Temuan uji gateway lokal (9router, alias `ai-builder` -> `gemini-3.8-flash-n`): `reasoning_effort` (none sampai high), `reasoning: {effort}`, dan `thinking` tidak mengubah hasil (reasoning tetap sekitar 120-480 token). Di 9router level reasoning dipilih lewat nama model, bukan parameter.
  - Penyelesaian di konfigurasi, bukan kode: `OPENAI_MODEL_CHEAP=ag/gemini-3.8-flash-low` (di `.env` lokal; `.env.example` dan `.env` VPS belum diubah). Uji ekstraksi spec PRD (tier cheap) pada PRD 30.030 karakter: 38,6 dtk dan 0 reasoning token, dibanding 81,5 dtk dan 7.647 reasoning token di `ai-builder`; jumlah persona, entitas, endpoint, dan aturan sama, journey 7 lawan 8 (satu sampel). Kualitas journey perlu dibandingkan di lebih banyak PRD sebelum menjadi default.
  - Sisa: `prompt_tokens` tetap 2.009 untuk pesan sepele di semua model, jadi sisipan prompt ada di lapisan 9router dan perlu dicek di dashboard 9router.
  - Gateway juga melaporkan `reasoning_tokens` yang bisa lebih besar dari `completion_tokens` (contoh uji: 1.553 vs 651), jadi angka itu indikasi, bukan hitungan akurat.

## 14. Wizard 2 (Survey): issue #56, #57, #58 (2026-10-08)

Induk: #59.

- **#56 Pertanyaan ganda.** Migrasi `20261008010000_survey_integrity`: (1) membersihkan pertanyaan ganda (sisakan `MIN(id)` per project, putaran, order; pada project yang sudah terdampak pasangan pertanyaan bisa berasal dari dua job berbeda) dan jawaban ganda; (2) unique `DiscoveryQuestion(projectId, round, order)` dan `DiscoveryAnswer(questionId)`; (3) partial unique index `AiJob_survey_active_key` (satu job `survey_round`/`survey_summary` aktif per project+type; hanya ada di SQL migrasi, Prisma tidak mendeteksinya sebagai drift). `enqueueAiJobOnce` mengembalikan job aktif bila terjadi pelanggaran unik (P2002), dipakai di `survey/generate` dan `survey/submit`. Penyimpanan pertanyaan memakai `createMany skipDuplicates`. Halaman survey memakai ref penjaga: satu POST generate per project (StrictMode) dan satu poller aktif. Prisma mencatat `prisma:error` di stderr setiap kali request bersamaan menabrak index; itu perilaku yang diharapkan.
- **#57 Latensi.** `generateSurveyRound` pindah ke tier `cheap` (ringkasan survey tetap `reasoning`); polling survey 1,5 dtk. Uji 3 ide x putaran 1-2 (6 panggilan per model, model cheap `ag/gemini-3.8-flash-low` lawan `ai-builder`): rata-rata 9,0 dtk lawan 26,7 dtk, reasoning token 293 lawan 10.569 total, semua keluaran valid (2-3 pertanyaan, saran termasuk opsi). Kualitas setara pada pembacaan manual; satu kasus putaran 1 (futsal) mengganti pertanyaan "siapa yang melayani" dengan "jumlah lapangan", sedikit keluar dari tema As-Is. Prompt tidak berubah (`survey-round@4`). Tanpa streaming. Pencapaian ini bergantung pada `OPENAI_MODEL_CHEAP` bernilai model tanpa reasoning; di VPS yang masih `ai-builder` waktu tetap 20-30 dtk.
- **#58 Submit atomik dan putaran terkunci.** Jawaban disimpan dalam satu transaksi (`upsert` per pertanyaan); `questionId` yang bukan milik project/putaran ditolak 400 (`invalid_question`), sebelumnya tidak divalidasi. `Project.surveyTotalRounds` dikunci saat survey dimulai (`survey/generate` atau submit pertama untuk project lama); upgrade paket di tengah survey tidak mengubah jumlah putaran project itu.
- **Tes.** `lib/__tests__/survey-integrity.test.ts` (terhadap database nyata, otomatis dilewati bila DB tidak terjangkau): 8 enqueue bersamaan menghasilkan 1 job, 5 penyimpanan pertanyaan bersamaan menyisakan 3, 5 submit jawaban bersamaan menyisakan 1 jawaban, submit dengan pertanyaan asing batal seluruhnya, putaran terkunci. Tes konkurensi di level HTTP belum ada (butuh sesi login).

## 15. Wizard 3 (Tech Stack): issue #60, #61, #62 (2026-10-08)

Induk: #63.

- **#60 Input rekomendasi.** `buildTechStackInput` menyusun pesan dari nama, ide awal, dan ringkasan survey (`Project.description`); ringkasan dilewati bila belum ada atau sama dengan ide. Cabang `prd.content` dihapus (tahap tech stack berjalan sebelum PRD dan terkunci sesudahnya, jadi tidak pernah terpakai). Prompt `tech-stack@3`: merujuk peran pengguna, skala, entitas, dan batasan di ringkasan; `reasoning` diminta 1-2 kalimat Bahasa Indonesia untuk ditampilkan ke user. Pada 3 ringkasan nyata, pilihan berubah sesuai isi survey (SQLite hanya untuk warung satu pengguna, PostgreSQL untuk yang multi-staf), tidak lagi SQLite untuk semuanya.
- **#61 Latensi.** `TechStackArchitect` pindah ke tier `cheap` (dikeluarkan dari `REASONING_AGENTS`) dan rekomendasi di-prefetch: handler `survey_summary` meng-enqueue `techstack_recommend` begitu ringkasan tersimpan (dilewati untuk paket Free; kegagalan prefetch hanya dicatat sebagai peringatan dan tidak menggagalkan ringkasan). Halaman tech stack memakai hasil yang sudah siap, menunggu job yang sedang berjalan, atau meminta baru secara otomatis bila belum ada. Uji 3 ringkasan nyata, `ag/gemini-3.8-flash-low` lawan `ai-builder`: pilihan paket dan database identik di ketiganya; 2,9-4,3 dtk lawan 13,4-16,6 dtk; reasoning token 0 lawan 3.773. Waktu tunggu user menjadi nyaris 0 dtk bila prefetch sudah selesai; tanpa prefetch (paket baru di-upgrade, atau job gagal) tetap sekitar 3-4 dtk, sedikit di atas target 3 dtk. Sama seperti survey, gain tier cheap bergantung pada `OPENAI_MODEL_CHEAP`.
- **#62 Penyimpanan dan tampilan.** `saveTechStack` (`lib/techstack-store.ts`) membungkus hapus + buat + maju ke `prd` dalam satu transaksi dengan `FOR UPDATE` pada baris Project; tanpa kunci itu empat penyimpanan bersamaan menyisakan 20 baris, dengan kunci 5 (diverifikasi). `POST /techstack/recommend` memakai `enqueueAiJobOnce`; partial unique index diperluas menjadi `AiJob_idempotent_active_key` (migrasi `20261008020000_techstack_job_idempotent`) mencakup `survey_round`, `survey_summary`, dan `techstack_recommend`. Keputusan tampilan: rekomendasi ditampilkan dalam kartu (nama paket, daftar teknologi, alasan, tombol "Minta rekomendasi ulang") dan baru disimpan saat user menekan Lanjut; sebelumnya langsung disimpan dan pindah ke PRD.
- **Tes.** `techstack-input.test.ts` (unit), `techstack-store.test.ts` (database nyata, otomatis dilewati bila DB tidak terjangkau): penyimpanan bersamaan, rollback saat gagal di tengah, dan enqueue bersamaan. Tampilan baru halaman tech stack belum diuji di browser (hanya typecheck dan lint).

## 16. Wizard 4 (PRD): issue #65, #66, #67 (2026-10-08)

Induk: #68.

- **#67 Generate PRD lewat antrean.** SSE dan lock in-memory dihapus. `POST /prd/generate` meng-enqueue job `prd_generate` secara idempoten (`enqueueAiJobOnce`; partial unique index diperluas ke `prd_generate` dan `prd_spec`, migrasi `20261008030000_prd_job_idempotent`), sehingga tahan restart dan aman multi-instance. Handler menulis teks yang sudah tersusun ke `AiJob.result` setiap 1,5 dtk (`reportJobProgress`). Kegagalan AI tidak diulang otomatis (satu job gagal = user menekan Generate Ulang), tetapi job yang prosesnya mati tetap dikembalikan ke antrean oleh sweeper. Penyimpanan PRD atomik: `savePrd` (`lib/prd-store.ts`) membungkus upsert dan `wizardStep` jadi `board` dalam satu transaksi (snapshot versi lama tetap best-effort sebelum transaksi). Riwayat chat tidak lagi dikirim bila hanya berisi ide awal (`buildChatHistory`); prompt `prd@3`.
- **#66 Spec di background (opsi A).** PRD disimpan dan tampil segera setelah teks selesai; ekstraksi spec berjalan sebagai job `prd_spec` (tier cheap, tanpa retry job karena `generateJson` sudah mengulang). `applyProductSpec` hanya menempelkan spec pada versi PRD yang diekstrak, sehingga PRD yang dibuat ulang selagi ekstraksi berjalan tidak tertimpa spec lama. `ensureProductSpec` (dipakai `tasks_generate`) menunggu job `prd_spec` yang aktif (maksimal 4 menit) lalu mengekstrak sendiri bila spec tetap belum ada, jadi tahap board menunggu spec siap. `POST /prd/spec/extract` kini meng-enqueue job (async) dan `GET /prd` mengembalikan `specStatus`. Prompt PRD tidak dipangkas (opsi C tidak diambil).
- **#65 Tampilan.** Hook `use-prd-generation` (menggantikan `use-prd-stream`) menampilkan teks sementara dari polling, status "Numa masih menulis...", lalu status "Menyusun alur pengguna (journey)..." selama job spec; kegagalan spec punya tombol "Susun sekarang". Muat ulang saat generate berjalan melanjutkan polling job yang aktif (tidak lagi halaman kosong akibat 409). `pollAiJob` mendapat `onProgress`.
- **Uji nyata (AI, worker, DB lokal).** Generate ganda: job kedua tidak dibuat (`created=false`). PRD 31 ribu karakter selesai dalam 92,7 dtk dengan 39 pembaruan progres; teks pertama terlihat setelah 30,3 dtk (model `ai-builder` melakukan reasoning 3.810 token sebelum token pertama keluar, jadi kriteria "beberapa detik" belum tercapai di sini; ini bergantung gateway/model, bukan kode). Spec selesai 48 dtk setelah PRD (7 entitas, 12 endpoint, 6 journey, model cheap tanpa reasoning). User dapat membaca PRD sekitar 48 dtk lebih cepat dibanding alur lama yang menunggu spec dulu.
- **Tes.** `prd-chat-history.test.ts` (unit); `prd-store.test.ts` (database nyata, dilewati bila DB tidak terjangkau): simpan dan versi, rollback saat gagal, spec hanya pada versi yang diekstrak, enqueue bersamaan, `ensureProductSpec` menunggu job. `scripts/test-e2e-wizard.ts` menunggu job `prd_generate` dan `prd_spec`. Tampilan halaman PRD belum diuji di browser. `real-test-minitask.ts` dan `real-test-invtrack.ts` sudah usang sejak sebelumnya (memakai endpoint tree dan alur lama) dan tidak diubah.

## 17. Wizard 5 (Board): issue #69, #70, #71, #72 (2026-10-08)

Induk: #73.

- **#70 Task per fase, paralel.** `generateTasksByPhase` membuat satu panggilan AI per fase roadmap (maksimal 5 paralel, tier cheap), lalu `mergePhaseTasks` menggabungkan: nomor global TASK-NNN, depends_on lokal dipetakan, depends_on ke featureId fase lain menjadi task terakhir fitur itu, dan task pertama tiap fitur otomatis bergantung pada fitur prasyarat roadmap bila AI lupa. Tiap fase menerima ringkasan fase lain (judul fitur dan featureId) untuk dependensi lintas fase, dan prompt hanya memuat aturan layer fase itu. Fase yang gagal diulang sekali; masih gagal berarti job gagal dengan nama fase. Change cycle tetap satu panggilan penuh (`generateTasksFromRoadmap`). Prompt `tasks@4`. Uji nyata pada project WarungPOS Kilat (5 fase, 9 fitur): satu panggilan lama (`ai-builder`) 184 dtk, 11 task, 16.628 reasoning token; per fase dengan reasoning 122 dtk, 21 task; per fase dengan model cheap 31,5 dtk, 15 task, 0 reasoning token. Ketiganya tanpa temuan cakupan requirement, endpoint tanpa UI, DAG, atau journey; tier cheap dipilih karena setara pada validator dan jauh lebih cepat. Kualitas isi task (kejelasan langkah dan kriteria) hanya dinilai lewat validator, belum dibaca manual per task.
- **#72 Roadmap.** Input roadmap kini spec PRD ringkas (entitas, endpoint, journey, indeks requirement) beserta tech stack terpilih, bukan markdown penuh (markdown hanya bila spec tidak ada); tier cheap; prompt tidak lagi berasumsi Node/Prisma (`roadmap@2`). Penyimpanan satu transaksi (`lib/roadmap-store.ts`, dipakai handler task dan route roadmap), dengan dependensi duplikat dibuang; kegagalan di tengah tidak meninggalkan roadmap setengah jadi (tes). Dependensi fitur dipetakan dua tahap sehingga dependensi ke fitur yang muncul belakangan tidak lagi hilang (bug lama). Roadmap memakan 15 dtk pada uji nyata (sebelumnya 26-44 dtk).
- **#71 Audit keamanan.** Kriteria keamanan baseline disuntikkan deterministik (`applySecurityBaseline`): .gitignore/.env untuk BOOTSTRAP, hash password untuk DATABASE, secret tanpa default, validasi body, HTTP 409 pada DELETE, autentikasi/IDOR (memakai `authRequired` dari spec, jalur login/health dianggap publik), dan rate limit login untuk BACKEND, serta token/secret dan input teks untuk FRONTEND. Audit AI (`security-audit@2`, hanya temuan) pindah ke job `security_audit` di background yang menambahkan temuan ke laporan validasi (`appendFindings`); tidak mengubah task. Jalur utama tidak lagi menunggu audit. Audit di background pada uji nyata memakan 188 dtk (model reasoning, 23.726 reasoning token) dan menghasilkan 4 temuan; waktunya tidak memblokir user, tetapi biayanya besar untuk keluaran ~675 token (dapat diturunkan ke cheap bila temuannya terbukti setara).
- **#69 Progres dan polling.** Polling Board memakai `pollAiJob` bersama (2 dtk, batas 10 menit sama dengan batas job di server) dan berhenti sesuai status job, bukan jumlah percobaan. Handler menulis langkah ke hasil job (`spec`, `roadmap`, `tasks` dengan hitungan fase, `validate`, `save`) dan halaman Board menampilkan daftar langkah. Bila batas tunggu klien habis, Board menampilkan "masih diproses" dengan tombol Periksa Status, bukan pesan gagal. `POST /tasks/generate` kini idempoten (`enqueueAiJobOnce`; partial unique index diperluas ke `tasks_generate` dan `security_audit`, migrasi `20261008040000_board_job_idempotent`) dan tidak lagi membalas 409.
- **Hasil uji alur lengkap** (AI nyata, worker, DB lokal; PRD dan stack disalin dari project uji, tanpa roadmap): roadmap 15 dtk, task per fase sampai 60,8 dtk total dari klik sampai task tersimpan (target di bawah 90 dtk tercapai), 19 task, 12 di antaranya memuat kriteria keamanan baseline, 23 dependensi, job kedua pada enqueue ganda tidak dibuat.
- **Tes.** `task-merge`, `security-baseline`, `tasks-phase-prompt`, `roadmap-input` (unit); `board-store` (database nyata, dilewati bila DB tidak terjangkau): roadmap atomik dan rollback, `appendFindings`, enqueue bersamaan. Tampilan Board baru belum diuji di browser. Prasyarat: `OPENAI_MODEL_CHEAP` bernilai model tanpa reasoning; dengan `ai-builder` waktunya tetap panjang.

## 18. Wizard 6 (Agent): issue #74, #75, #76, #77 (2026-10-08)

Induk: #78. #74 dan #75 dirilis bersamaan agar agent tidak kehilangan titik berhenti atau terkunci 409.

- **#74 Checkpoint dihapus total.** Dihapus: `routes/checkpoints.ts`, `lib/checkpoint-gate.ts`, gate 409 di `next`/`start`, pembuatan checkpoint di `done`, `GET /api/agent/checkpoints`, model `Checkpoint` (migrasi `20261008050000_cli_device_login_drop_checkpoint` men-drop tabel), referensi di `account-data`, `seed`, dan `config`; di web `CheckpointBanner` dan copy landing (kendali, FAQ, workflow); di CLI perintah `numa checkpoint`, output `CHECKPOINT PENDING`, dan bagian checkpoint di skill `numa-workflow`. Tidak ada lagi referensi `checkpoint` di kode dan dokumen aktif (selain migrasi lama, tes yang menegaskan endpoint sudah tidak ada, dan laporan/rencana historis).
- **#75 Mode eksekusi.** Dialog Master Prompt menampilkan dua pilihan: "dengan konfirmasi per layer" (default) dan "otomatis penuh". Mode hanya hidup di teks prompt (`?mode=confirm|auto`) dan skill pack; pilihan terakhir diingat per project di localStorage browser. `POST /agent/tasks/:id/complete` kini membalas `layerCompleted` dan `allTasksDone` (informasi netral, tanpa record); `numa done` mencetaknya dan menunjuk ke mode di Master Prompt. Skill `numa-workflow` bagian 6 menjelaskan kedua mode. Prompt lama yang meminta persetujuan di setiap task diganti.
- **#76 Satu sumber Master Prompt.** `lib/master-prompt.ts` (`buildMasterPrompt`) adalah satu-satunya implementasi; dialog web mengambilnya dari `GET /api/projects/:id/master-prompt?mode=` dan tidak lagi menyusun prompt sendiri. Prompt yang disalin kini memuat `numa init`, kontrak arsitektur sesuai stack, checklist kualitas, larangan `--force`, `numa block`/`retry`, dan cara menjalankan aplikasi. Tidak memuat token (dijaga tes).
- **#77 dan perubahan arah login (atas arahan user): login CLI lewat browser.** Alih-alih membuat token di dialog, CLI tidak lagi memakai `numa login` dan PAT salin-tempel. Alur device code: `POST /api/cli-auth/start` -> user membuka `/cli-login?code=XXXX-XXXX` di web (halaman baru, wajib login, kembali ke tujuan lewat `?next=`) dan menekan Setujui -> `POST /api/cli-auth/poll` mengembalikan token berlingkup semua project (90 hari) tepat sekali (transisi approved -> consumed atomik; polling bersamaan hanya menghasilkan satu token; token tidak pernah disimpan, hanya sha256). Tabel `CliAuthRequest` (TTL 10 menit, kode 8 karakter tanpa huruf/angka yang mudah tertukar), rate limit pada start/approve/deny/request, audit `cli.login.approve|deny` dan `token.create`. Login terjadi otomatis di pemakaian pertama perintah apa pun; sesi tanpa TTY (agent) menunggu ~90 dtk lalu keluar kode 2 dan menyimpan permintaan, sehingga menjalankan ulang melanjutkan kode yang sama. Opsi global `--api-url` menggantikan `numa login --api-url`. Token kedaluwarsa atau dicabut (401) dihapus lokal sehingga perintah berikutnya login ulang. `NUMA_TOKEN` tetap didukung untuk CI/headless, dan PAT manual di halaman profil dipertahankan untuk itu; pembuatan token default otomatis di header web dihapus.
- **Keputusan lain.** Nilai `guide`/`done` tetap di `STAGE_ORDER` dan default skema `wizardStep` karena menjadi data lama (kartu project, penguncian tahap); dokumentasi kini menyatakan tahap Agent adalah dialog di Board dan nilai itu tidak pernah diisi API. CLI naik ke 0.6.0 (skill pack berubah); perlu dipublish manual oleh pemilik. CLI lama 0.5.0 terhadap server baru: `numa checkpoint` mendapat 404 dan `numa done` mengabaikan `checkpointPending` yang tidak ada lagi; sebaiknya semua pengguna memperbarui CLI.
- **Tes.** API: `master-prompt` (mode berbeda, tanpa token/`numa login`/checkpoint), `cli-auth` (kode, alur lengkap terhadap DB, token terbit sekali pada polling bersamaan, penolakan, kedaluwarsa), tes HTTP (endpoint login CLI butuh sesi, endpoint checkpoint 404). CLI: `device-login` dengan server tiruan (persetujuan, penolakan, kedaluwarsa, non-interaktif lalu lanjut dengan kode yang sama). Uji nyata terhadap server API sungguhan: CLI memulai login, kode disetujui, token diterima dan dipakai ke `GET /api/agent/scopes` (200, 2 project). Halaman `/cli-login`, dialog Master Prompt, dan pembukaan browser otomatis belum diuji di browser; `scripts/test-cli-e2e.ts` disesuaikan tetapi belum dijalankan.
