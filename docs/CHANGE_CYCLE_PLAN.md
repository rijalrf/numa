# Rencana: Minta Perubahan Lewat Siklus Ringan (Change Cycle)

Tanggal: 2026-10-08. Cakupan: `apps/api` (route siklus, job AI, analisis dampak, merge PRD dan spec), `apps/web` (panel Minta Perubahan, Board), Prisma (index job), dokumen.

Status: **seluruh lima tahap selesai di kode pada 2026-10-09; migrasi sudah diterapkan ke database lokal dan e2e dengan AI nyata lulus** (lihat `LAPORAN_PERUBAHAN.md` bagian 25). Belum dicakup: jalur klarifikasi dan pecah dengan AI nyata, serta UI di browser. Enam keputusan sudah dijawab user (bagian 4), ditambah aturan satu DRAFT per project yang disetujui user. Menyimpang dari rencana: ditambah endpoint `POST /cycles/:id/analyze` untuk draf sisa pemecahan (tahap 1); di tahap 2 konteks PRD untuk analisis diganti ringkasan (indeks requirement, entitas, endpoint, journey) karena JSON PRD penuh terpotong 10.000 karakter, `specDelta` juga ditulis ke markdown PRD (generator task memakai markdown, bukan daftar terstruktur, selama PRD muat penuh), penanda requirement sementara dari AI adalah `NEW-n`, dan quality gate siklus hanya menilai requirement dan endpoint yang baru.

## 1. Latar belakang

Alur Minta Perubahan di Board saat ini (`POST /api/projects/:id/change-request`, `routes/cycles.ts`) menghapus seluruh survey, menambahkan teks perubahan ke `Project.idea`, lalu mengembalikan wizard ke `survey`. User mengulang survey, tech stack, PRD, spec, dan generate task seperti project baru.

Temuan dari kode:

- **PRD lama tidak menjadi input.** `generatePrdMarkdownStream` (`lib/ai/prd.ts`) hanya menerima ide, survey baru, dan stack. Requirement lama bisa hilang atau bernomor ulang, padahal task DONE merujuk nomor lama.
- **Roadmap tidak diperbarui.** Job `tasks_generate` hanya membuat roadmap bila belum ada, jadi fitur dari perubahan tidak masuk roadmap.
- **Task duplikat.** Seluruh aplikasi digenerate ulang; dedup hanya mencocokkan judul atau `taskId` yang persis sama dengan task DONE.
- **Siklus tidak pernah terbentuk.** Tidak ada kode yang membuat `ProjectCycle`; task perubahan tersimpan dengan `cycleId: null`. `cycle_generate`, `analyzeChangeRequest`, `mergePrdDelta`, dan `CycleDetailDialog` praktis tidak terpakai.
- **Biaya.** Satu perubahan kecil menjalankan beberapa putaran survey, ringkasan (reasoning), rekomendasi stack, PRD penuh, spec, task semua fase, dan audit keamanan.
- **Tema survey tidak cocok.** Putaran 1 bertema "Proses Saat Ini & Masalah Utama".
- **Stack bisa berubah di tengah project.** Tahap tech stack diulang dan `saveTechStack` mengganti stack lama.
- **`idea` terus memanjang** setiap perubahan, sehingga token prompt naik.
- **Teks panel tidak sesuai perilaku.** Panel menjanjikan "delta append" PRD, padahal PRD digenerate ulang penuh.
- **Endpoint `change-request`:** hapus survey dan update project tidak dalam satu transaksi, tidak ada `recordAudit`, dan `err.message` dikirim ke client.

## 2. Alur baru

```
Board: Minta Perubahan
  -> POST /change-request -> siklus DRAFT + job cycle_analyze
  -> panel menampilkan hasil analisis
       - VAGUE: pertanyaan klarifikasi wajib dijawab -> analisis ulang
       - CLEAR: ringkasan, tipe, ukuran, requirement baru, perkiraan task, usulan pecah (bila LARGE)
  -> user Konfirmasi (utuh, atau pecah: bagian A sekarang, bagian B jadi DRAFT berikutnya)
  -> job cycle_generate
       -> merge requirement baru ke PRD + merge specDelta ke spec + simpan task (cycleId terisi), satu transaksi
  -> Board memilih siklus baru; siklus DONE saat semua task-nya DONE (logika sudah ada di routes/agent.ts dan routes/tasks.ts)
```

Survey, tech stack, PRD penuh, dan roadmap tidak dijalankan ulang. Panggilan AI per perubahan: 1 analisis (reasoning) + 1 generate task (+1 analisis ulang bila klarifikasi atau pecah) + audit keamanan di background.

## 3. Langkah implementasi

### Tahap 1: API siklus (`routes/cycles.ts`)

1. **Tulis ulang `POST /change-request`.**
   - Guard tetap: semua task DONE, tidak ada siklus OPEN.
   - Hanya satu DRAFT per project. Bila sudah ada DRAFT, endpoint menolak (409) dan panel membuka DRAFT itu untuk dilanjutkan atau dibatalkan.
   - Buat DRAFT dengan `number = max + 1` dalam satu transaksi, lalu `enqueueAiJobOnce` job `cycle_analyze`. Respons `{ cycleId }`.
   - Tidak lagi menghapus survey, mengubah `idea`, atau mengubah `wizardStep`.
   - `recordAudit` (`cycle.request`); error lewat `toClientError`.
2. **Job baru `cycle_analyze`.** Menjalankan `analyzeChangeRequest` lalu menyimpan `impact`, `type`, `size`, dan `clarify` (pertanyaan dan jawaban). Ditambahkan ke daftar tipe job, ke `enqueueAiJobOnce`, dan ke partial unique index `AiJob_idempotent_active_key` (migrasi Prisma).
3. **`POST /cycles/:cycleId/clarify`.** Body: jawaban per pertanyaan (Zod). Menyimpan jawaban ke `clarify`, lalu enqueue `cycle_analyze` lagi dengan `clarifyAnswers`.
4. **`DELETE /cycles/:cycleId`.** Hanya untuk DRAFT; `recordAudit`.
5. **Perbaiki `cycle_generate`.**
   - Konfirmasi ditolak (409) bila `impact.clarity` masih `VAGUE`.
   - Roadmap yang dikirim ke generator hanya berisi fitur di `impact.impactedFeatureIds` ditambah satu fitur siklus, bukan seluruh roadmap.
   - Mode pecah (`split: 'a' | 'b'`): bagian terpilih dianalisis ulang (perilaku sekarang), dan bagian lainnya dibuat sebagai siklus DRAFT baru (`request` = teks bagian itu, belum dianalisis).
   - Merge PRD, merge spec, simpan task, dan update siklus ke OPEN dalam satu transaksi; `startOrder` dihitung di dalam transaksi. Setelah itu job aman diulang, sehingga `maxAttempts: 1` bisa dilepas.
6. **`GET /cycles`** ikut mengembalikan status job `cycle_analyze` dan `cycle_generate` terakhir, agar panel bisa melanjutkan polling setelah reload.

### Tahap 2: AI dan kontrak (`lib/ai/cycle.ts`)

1. `ImpactSchema` ditambah:
   - `impactedFeatureIds`: dipilih dari daftar fitur roadmap (id dan judul) yang dikirim di prompt; id yang tidak dikenal dibuang.
   - `specDelta`: tambahan `journeys`, entitas, dan endpoint dengan bentuk skema yang sama dengan `ProductSpecSchema`.
2. Input `analyzeChangeRequest` dilengkapi: ringkasan task DONE (judul, layer, file; dibatasi) dan daftar fitur roadmap.
3. `mergePrdDelta` melanjutkan penomoran dari FR terbesar di PRD (mis. FR-024). Nomor ditetapkan oleh kode, bukan AI; `requirementIds` di `specDelta` dipetakan ke nomor baru.
4. Fungsi murni baru untuk merge `specDelta` ke `PrdDoc.spec` (dedup entitas berdasarkan nama, endpoint berdasarkan method dan path).
5. `PROMPT_VERSIONS.cycle` naik ke `cycle@2`. `tasks@` ikut naik bila aturan siklus di `buildTasksPrompt` berubah.

### Tahap 3: Web

1. `ChangeRequestPanel` menjadi beberapa langkah dalam panel yang sama:
   - input
   - menganalisis (polling)
   - klarifikasi (wajib bila VAGUE)
   - ringkasan dampak, dengan pilihan utuh atau pecah bila ada `splitProposal`, serta tombol Konfirmasi dan Batalkan
   - membuat task (polling)
2. Membuka panel saat ada DRAFT langsung melanjutkan DRAFT tersebut.
3. Teks panduan disesuaikan dengan perilaku baru.
4. Setelah selesai, Board memilih siklus baru di CycleBar lalu memuat ulang task dan siklus.

### Tahap 4: Bersih-bersih

1. Hapus jalur lama (reset survey dan kembali ke wizard). `npm run lint` dan `npm run deadcode` harus bersih.
2. Data lama: `idea` yang sudah berisi `PERUBAHAN DIMINTA` dibiarkan, tanpa migrasi.

### Tahap 5: Tes dan dokumen

1. Unit test:
   - `mergePrdDelta`: penomoran FR berlanjut dan pemetaan `requirementIds`.
   - Merge `specDelta`: dedup.
   - Penyaringan `impactedFeatureIds`.
2. Tes HTTP (`routes/__tests__/http.test.ts`): validasi body `change-request`, `clarify`, `generate`.
3. `scripts/test-e2e-wizard.ts`: tambah langkah siklus (ajukan, analisis, konfirmasi, task dengan `cycleId`).
4. Perbarui `AGENTS.md` (alur Board, tabel modul AI, daftar job idempoten, `PROMPT_VERSIONS`) dan `docs/LAPORAN_PERUBAHAN.md`.

## 4. Keputusan

| # | Pertanyaan | Keputusan |
|---|-----------|-----------|
| 1 | Arah perbaikan | Opsi A: jalur siklus ringan memakai infrastruktur `ProjectCycle` yang sudah ada. |
| 2 | Permintaan VAGUE | Klarifikasi wajib dijawab sebelum konfirmasi. |
| 3 | Perubahan LARGE | User memilih utuh atau pecah (mode `single`/`a`/`b` dipertahankan). |
| 4 | Sisa bagian saat dipecah | Disimpan otomatis sebagai siklus DRAFT berikutnya. |
| 5 | Pembaruan spec PRD | `specDelta` dari analisis, di-merge deterministik tanpa panggilan AI tambahan. |
| 6 | Penomoran requirement baru | Lanjutkan FR-NNN dari nomor terbesar, ditetapkan oleh kode. |
| 7 | Batas klarifikasi | Maksimal 2 putaran jawaban; setelah itu analisis dipaksa CLEAR (AI diminta menyebut asumsi di ringkasan). |
| 8 | Draf per project | Hanya satu DRAFT per project; ajuan baru ditolak selama masih ada DRAFT. |

Mengikuti perilaku sekarang (tidak diubah):

- Siklus tidak memakai kuota project; budget token tetap berlaku lewat `assertAiBudget`.
- Paket Free tetap tidak bisa membuat task.
- Siklus baru hanya bisa diajukan bila semua task DONE dan tidak ada siklus OPEN.
