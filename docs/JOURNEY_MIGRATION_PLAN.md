# Rencana: Hapus Tree dan Flow, Ganti dengan Perluasan Journey di PRD

Tanggal: 2026-10-06. Cakupan: `apps/api` (tree, flow, spec, generator task), `apps/web` (halaman tree), Prisma, CLI, dokumen.

Status: **langkah 1 dan 2 sudah dikerjakan di kode (2026-10-06)**: tree dihapus, journey diperluas, flow tersisa hanya di backend. E2E nyata lulus (lihat laporan 7d). Langkah 3 (uji pembanding dengan dan tanpa flow), 4 (hapus flow dan migrasi tabel), dan 5 (truncate data) belum. Lihat `docs/LAPORAN_PERUBAHAN.md` bagian 7d. Arah sudah disepakati dengan user pada 2026-10-06 (hapus tree dan flow, ganti dengan perluasan journey, wizard menjadi 7 langkah, journey hanya terlihat di halaman PRD). Empat keputusan terbuka sudah dijawab (bagian 8). Detail teknis di bagian 5 sampai 7 masih usulan sampai rencana implementasi dibuat.

## 1. Latar belakang

Biaya token satu project penuh (idea sampai tasks) sekitar 171 ribu token dalam 14 panggilan AI (dari `AiCallLog` database lokal, baru satu project lengkap sehingga angkanya taksiran kasar).

| Panggilan | Token rata-rata | Waktu |
|---|---|---|
| `generateFlowFromPrd` | 29,9 ribu | 90 detik |
| `generateTreeFromPrd` | 15,5 ribu | 55 detik |
| `ProductSpecExtractor` | 14,0 ribu | 50 detik |

Tree dan flow sama-sama diturunkan dari PRD. Keduanya sekitar 45 ribu token (sekitar 26 persen) per project.

## 2. Temuan dari kode

Tree:
- Generator task (`routes/tasks.ts`) tidak membaca tabel `TreeNode`. Roadmap dibuat dari PRD (`roadmap.ts`), bukan dari tree.
- Tree hanya dipakai untuk visualisasi di halaman `/projects/:id/tree` dan penanda tahap wizard (`lib/stage.ts` menghitung tahap `tree` dari `treeNodes > 0`).

Flow:
- `BusinessFlow` dipakai `routes/tasks.ts` untuk `enumerateFlowPaths` dan `renderFlowScenarios`, lalu disuntikkan ke prompt generator task (`flowScenarios`).
- `lib/task-quality.ts` memanggil `applyFlowContract` (`lib/ai/flow-contract.ts`): menyuntikkan skenario E2E ke task INTEGRATION dan memeriksa cakupan step sistem (`FLOW_STEP_UNCOVERED`, `FLOW_NO_INTEGRATION_TASK`, dan seterusnya).
- Bila flow tidak ada, generator task tetap jalan: hanya mencatat temuan `FLOW_MISSING` (info) dan skenario E2E diturunkan dari PRD saja.

Journey yang sudah ada:
- `ProductSpecSchema.journeys` berisi `{ name, steps[], requirementIds[] }` (linear, tanpa percabangan), diekstrak dari PRD oleh `extractProductSpec`.
- `lib/task-context.ts` sudah memakainya per task untuk `numa context`, bersama edge case (EC-xxx) yang disebut dalam requirement.

## 3. Keputusan

1. Hapus tree sepenuhnya.
2. Hapus flow sepenuhnya.
3. Perluas journey di PRD dan spec sebagai pengganti sumber skenario E2E task INTEGRATION.
4. Tidak ada tahap wizard baru dan tidak ada panggilan AI baru.
5. Langkah 5 (tree dan flow) dihapus dari wizard: setelah PRD user langsung ke Board. Wizard menjadi 7 langkah (chat, survey, techstack, prd, board, guide, done).
6. Journey hanya ditampilkan di halaman PRD, tidak ada halaman terpisah. Keluarga fitur "Numa Flow" ikut dihapus dari penamaan.

## 4. Yang hilang dan cara menggantinya

| Hilang | Pengganti |
|---|---|
| Percabangan dan jalur gagal (decision bercabang menghasilkan beberapa skenario E2E) | Journey utama dan journey gagal, dirujuk ke edge case EC-xxx |
| Pengecekan cakupan step sistem ke requirement dan task | Pengecekan cakupan `requirementIds` per journey oleh validator yang sudah ada |
| Validasi struktur ketat (satu start, semua step terjangkau, label decision unik) | Validasi Zod yang lebih ringan pada skema journey |
| Diagram swimlane visual | Tidak diganti. Journey ditampilkan sebagai daftar di halaman PRD (keputusan 2026-10-06) |

## 5. Usulan perluasan skema journey (perlu keputusan)

Skema sekarang: `{ name, steps[], requirementIds[] }`.

Usulan: tambah `kind` (`main` atau `failure`) dan `branchFrom` (`{ journey, stepIndex }`, hanya untuk `failure`).

Contoh: journey `main` "Checkout berhasil", lalu journey `failure` "Pembayaran ditolak" dengan `branchFrom` langkah 3 dari journey utama.

Alternatif: edge case (EC-xxx) langsung dijadikan journey gagal, tanpa field `branchFrom`.

Prompt ekstraksi spec (`product-spec@2`) diminta menghasilkan journey utama beserta jalur gagal dan merujuk EC-xxx. Versi prompt dinaikkan di `PROMPT_VERSIONS`.

## 6. Yang perlu diubah (inventaris, belum diverifikasi lengkap)

API:
- `lib/ai/product-spec.ts`: skema dan prompt ekstraksi (naikkan versi prompt).
- `lib/ai/flow-contract.ts`: ganti `enumerateFlowPaths` dan `renderFlowScenarios` dengan penyusun skenario dari `journeys`.
- `lib/task-quality.ts`, `routes/tasks.ts`: ganti sumber flow dengan journey; buang `FLOW_MISSING`.
- `lib/ai/chat.ts`: hapus `generateTreeFromPrd` dan `generateFlowFromPrd`.
- `routes/tree.ts` dan job `tree_generate` (`lib/ai/job.ts`): hapus.
- `lib/stage.ts`: `STAGE_ORDER` dan `furthestStage` tidak lagi bergantung pada `treeNodes`.
- `lib/ai/schemas.ts`: `BusinessFlowSchema`, `TreeDataSchema`.
- `lib/artifact-version.ts`, `lib/account-data.ts`: snapshot dan ekspor yang menyebut business flow dan tree node.
- `lib/ai/prompts.ts`: hapus prompt tree dan flow, naikkan versi prompt terkait.
- `lib/ai/ai-service.ts`: daftar `agentName` yang memuat `generateFlowFromPrd`.

Web:
- `pages/projects/tree.tsx`, `lib/tree-layout.ts`, `hooks/use-tree-pan-zoom.ts`, `components/tree/*`, `components/flow/*`, rute di `App.tsx`, stepper wizard (8 menjadi 7 langkah), dan tampilan daftar journey di `pages/projects/prd.tsx`.

Prisma:
- Tabel `TreeNode` dan `BusinessFlow`: migrasi hapus atau biarkan (lihat bagian 8). Hapus kolom tak terpakai seperti `edgeLabel` pada `TreeNode` beserta migrasinya bila tabel dibuang.

CLI dan dokumen:
- `packages/cli`: periksa referensi tree (`task-state.ts`, `guard.ts`, `sync.ts`, `index.ts`); belum dipastikan apakah itu pohon tahap wizard atau pohon file.
- `AGENTS.md` (tabel wizard, modul AI, struktur, `PROMPT_VERSIONS`), `docs/LAPORAN_PERUBAHAN.md`, `docs/AI_CALLS_REPORT.md`, `docs/PRD.md`, `docs/BRAND.md`, `scripts/test-e2e-wizard.ts`.

## 7. Risiko

- Kualitas jalur gagal kini bergantung pada prompt ekstraksi spec. Flow dulu divalidasi Zod ketat, journey lebih longgar.
- Kualitas task INTEGRATION setelah flow dihapus belum diukur. Perlu pembanding sebelum flow benar-benar dihapus.
- Project lama yang sudah punya `BusinessFlow` dan `TreeNode`: data dan tahap wizard-nya harus tetap terbaca.
- Belum diperiksa apakah `api-coverage-validator`, `cleanup-validator`, atau siklus perubahan (`cycle.ts`) bergantung pada tree atau flow.

## 8. Keputusan

Diputuskan user pada 2026-10-06:

1. Percabangan: field `branchFrom` pada journey gagal (merujuk journey dan langkah asal). EC-xxx tetap dirujuk lewat `requirementIds`.
2. Validator pengganti `FLOW_STEP_UNCOVERED`: cakupan requirement per journey, deterministik tanpa AI, tingkat warning (tidak memblokir pembuatan task).
3. Data lama: tabel `TreeNode` dan `BusinessFlow` dihapus langsung dalam migrasi (tanpa masa tenggang).
4. Project lama: seluruh data di database lokal dan server UAT akan di-truncate oleh pemilik, jadi **tidak ada kompatibilitas mundur**. Tahap `tree` dihapus penuh dari `STAGE_ORDER` (tanpa alias), `furthestStage` tidak lagi menghitung `treeNodes`, dan enum di `routes/wizard-step.ts` tidak memuat `tree`. Truncate dilakukan pemilik, bukan bagian dari perubahan kode.
5. Langkah 5 dihapus dari wizard (7 langkah), journey hanya terlihat di halaman PRD, nama "Numa Flow" dihapus (rapikan `BRAND.md` dan `AGENTS.md`).

Temuan tambahan (sudah ditangani): `lib/ai/cycle.ts` punya parameter `tree` untuk prompt change request, tetapi `routes/cycles.ts` tidak pernah mengisinya. Parameter mati itu dihapus tanpa perubahan perilaku, jadi tidak perlu sumber pengganti.

Catatan konsekuensi keputusan 3 dan 4: karena tabel dibuang langsung dan tidak ada rollback data, perbandingan task INTEGRATION dengan dan tanpa flow (langkah 3 di bagian 9) harus dilakukan **sebelum** migrasi hapus dijalankan.

## 9. Urutan bertahap (usulan)

1. Hapus tree di kode (hemat sekitar 15 ribu token, risiko kualitas hampir nol), termasuk ganti sumber di `cycle.ts`. Pertahankan flow dan tabelnya sementara.
2. Perluas skema journey (`kind`, `branchFrom`) dan prompt ekstraksi spec, berdampingan dengan flow.
3. Uji pada satu project: bandingkan task INTEGRATION dengan flow dan dengan journey (skenario E2E, cakupan requirement, jalur gagal). Wajib sebelum langkah 4.
4. Bila hasil memadai, hapus flow di kode, jalankan satu migrasi yang membuang `TreeNode` dan `BusinessFlow`, rapikan dokumen dan UI.
5. Pemilik truncate database lokal dan UAT sebelum deploy.

Setiap langkah mengubah perilaku, jadi `AGENTS.md` dan `docs/LAPORAN_PERUBAHAN.md` diperbarui dalam pekerjaan yang sama.
