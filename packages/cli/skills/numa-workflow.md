---
name: numa-workflow
description: Alur kerja wajib agent Numa - loop CLI next/start/context/done, aturan guard dan --force, checkpoint, block/retry, dan tindakan bila macet.
---

# Alur Kerja Agent Numa

Skill ini mengatur cara Anda bekerja lewat CLI `numa`. Baca sebelum mengerjakan task pertama dan ulangi bila ragu.

## 1. Loop Eksekusi (satu task satu putaran)
1. `numa next` - ambil task berikutnya. Task `IN_PROGRESS` yang tertinggal diprioritaskan (resume).
2. `numa start` - kunci task dan catat baseline git ke `.numa/state.json`. Guard hanya menilai perubahan sejak titik ini.
3. `numa context` - baca Acceptance Criteria, file yang boleh diubah, file terlarang, dan validation commands.
4. Kerjakan. Tulis test lebih dulu bila task menyentuh logika (lihat skill numa-tdd).
5. Verifikasi sendiri: jalankan validation commands dan test terkait di lokal.
6. `numa done` - guard dijalankan, hasilnya dikirim ke server.

Jangan melompat urutan. Jangan mengerjakan dua task sekaligus. Jangan mengerjakan task yang tidak diberikan `numa next`.

## 2. Bounded Context
- Sentuh hanya file pada `files_to_create` dan `files_to_modify`. File di luar daftar hanya menghasilkan peringatan, tetapi tetap pelanggaran lingkup: jelaskan alasannya di ringkasan `--summary`.
- File pada `forbidden` tidak boleh disentuh sama sekali. Pelanggaran menghentikan `done` dan task menjadi `BLOCKED`.
- Path pada task adalah panduan arsitektur. Bila stack proyek berbeda dari path yang tertulis, ikuti kontrak arsitektur (skill numa-architecture) dan catat perbedaannya di ringkasan.
- Task berstatus `DONE` tidak dikerjakan ulang, termasuk setelah task di-generate ulang.

## 3. Validation Commands dan Guard
- Perintah dijalankan CLI dengan kebijakan keamanan: pipe, `||`, `;`, backtick, `$(...)`, redirect, dan program berbahaya ditolak.
- Program di luar allowlist meminta konfirmasi. `--allow-unlisted` hanya dipakai bila Anda memercayai perintahnya dan user mengizinkan.
- Bila perintah gagal: baca output, perbaiki kode, jalankan `numa done` lagi. Jangan mengubah validation command agar lolos.

## 4. Larangan `--force`
- `numa done --force` melewati guard dan dicatat sebagai `forced` di audit server. Itu bukan jalan pintas.
- Pakai hanya bila user secara eksplisit meminta, atau perintah verifikasi tidak bisa jalan di lingkungan ini (mis. butuh layanan eksternal) dan sudah diverifikasi manual. Tuliskan alasannya di `--summary`.
- Kegagalan test, lint, atau type check bukan alasan memakai `--force`.

## 5. Bila Macet atau Spesifikasi Ambigu
- Spesifikasi kontradiktif, dependensi hilang, atau butuh keputusan produk: `numa block --reason "<alasan konkret>"`, lalu berhenti dan laporkan ke user.
- Setelah user menyelesaikan masalah: `numa retry` mengembalikan task ke `TODO`, lalu ulangi dari `numa start`.
- Jangan menebak kebutuhan, jangan menambah fitur di luar task, jangan diam-diam mengganti pendekatan.

## 6. Checkpoint dan Transisi Layer
- Setelah `numa done`, bila muncul `checkpointPending` atau pesan checkpoint: BERHENTI. Persetujuan hanya bisa diberikan user lewat web (halaman Board).
- `numa checkpoint` menampilkan checkpoint yang menunggu. `numa start` ditolak (409) selama ada checkpoint pemblokir.
- Jangan mencoba menyetujui checkpoint sendiri dan jangan menyentuh data checkpoint.

## 7. Kejujuran Laporan
- Laporkan error apa adanya. Dilarang membuat mock fallback yang menyembunyikan kegagalan, dan dilarang mengklaim test lulus bila tidak dijalankan.
- Ringkasan `--summary` berisi: apa yang diubah, bagaimana diverifikasi, dan keputusan yang menyimpang dari spesifikasi.
- Gunakan `--commit` bila user menginginkan conventional commit otomatis per task; jangan melakukan commit atau push di luar itu tanpa diminta.

## 8. Keamanan Operasional
- Login dilakukan user. Jangan meminta, menampilkan, atau menyalin token PAT; jangan menulisnya ke berkas atau log.
- Token hanya berlaku untuk project yang ditetapkan. Jangan mengakses project lain dan jangan mengubah `.numa/workspace.json` secara manual.
- Setelah semua task selesai, jalankan `numa sync` agar server mencatat ringkasan workspace untuk siklus perubahan berikutnya.

## 9. Checklist Sebelum `numa done`
- [ ] Acceptance Criteria terpenuhi dan dibuktikan dengan test atau pengecekan nyata.
- [ ] Hanya file dalam lingkup yang berubah (`git status` bersih dari file lain).
- [ ] Validation commands lulus di lokal.
- [ ] Tidak ada secret, `console.log` debug, kode mati, atau TODO tanpa tiket.
- [ ] Ringkasan menjelaskan penyimpangan dari spesifikasi, bila ada.
