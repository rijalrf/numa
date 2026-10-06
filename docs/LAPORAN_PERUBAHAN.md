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

- Webhook Midtrans idempoten: hanya memproses pembayaran berstatus `pending`, mencocokkan `gross_amount` dengan nominal pembayaran, membandingkan signature secara constant-time, dan memperbarui `payment` serta `subscription` dalam satu transaksi. Sebelumnya, notifikasi yang dikirim ulang bisa mereset kuota dan memperpanjang langganan berulang.
- Semua panggilan AI kini membawa `projectId` dan `agentName` sehingga budget token bulanan benar-benar ditegakkan (sebelumnya sekitar 25% token tidak terikat tenant).
- `trust proxy` tidak lagi `true` (rate limit bisa dipalsukan lewat `X-Forwarded-For`); jumlah hop diatur lewat `TRUST_PROXY_HOPS`.
- Validasi Zod ditambahkan di route agent, agent-tokens, techstack, tree, dan checkpoints.
- Validasi env saat startup (`env.ts`, `env-check.ts`): gagal cepat bila env wajib kosong.
- Pesan error internal tidak lagi bocor ke klien (`HttpError`, `toClientError`).
- Dependensi rentan diperbarui (`express`/`qs`, `react-router-dom`).

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
| 5 | Upgrade ke Starter lewat `/settings/billing` | Pembayaran Midtrans (atau ubah paket langsung di DB untuk uji lokal). Tahap berpindah ke tech stack. |
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
- Belum diteruskan ke container: `MIDTRANS_SERVER_KEY` dan `MIDTRANS_IS_PRODUCTION` (compose produksi dan `.env.example`). Selama itu belum ada, pembayaran dan webhook menjawab 503.
- `.mcp.json` sengaja tidak di-commit.
- Password lama database tetap ada di riwayat git; rotasi masih diperlukan.
- Domain server UAT: `https://numa.opendv.xyz` (domain lama `numa.mrijal.my.id` sudah dihapus dari README, AGENTS.md, docs, dan `.env.example`). Di `.env` VPS, `FE_URL`, `BETTER_AUTH_URL`, dan `VITE_API_URL` harus memakai domain ini. Teks README paket CLI ikut berubah, jadi baru tampil di npm setelah CLI dipublish ulang.
