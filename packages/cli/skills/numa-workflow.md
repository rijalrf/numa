---
name: numa-workflow
description: Alur kerja wajib agent Numa - loop CLI next/start/context/done, mode eksekusi (konfirmasi per layer atau otomatis penuh), aturan guard dan --force, block/retry, dan tindakan bila macet.
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
- Daftar file pada task adalah batas kerja Anda, bukan saran. Bila stack proyek berbeda dari path yang tertulis (mis. ekstensi atau struktur folder), ikuti kontrak arsitektur (skill numa-architecture) dan catat perbedaannya di ringkasan.
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

## 6. Dilarang Menambal
Bila sesuatu tidak cocok antar bagian, perbaiki di sumbernya. Jangan menutupinya.
- Link atau path yang salah dibetulkan di tempat path itu didefinisikan. Dilarang membuat halaman yang isinya hanya redirect untuk menutupi path yang salah.
- Dilarang membuat file yang fungsinya sama dengan file yang sudah ada dengan nama lain (mis. skema validasi, provider, komponen banner, atau API client kedua). Pakai ulang file yang ada; bila belum ada, buat satu kali di task pemiliknya.
- Task FRONTEND dilarang membuat endpoint API. Bila endpoint yang dibutuhkan tidak ada, jalankan `numa block --reason "<endpoint yang dibutuhkan>"`.
- Bila perbaikan sumber berada di luar daftar file task, jangan menambalnya di dalam task ini: jelaskan di `--summary` (atau gunakan `numa block` bila pekerjaan tidak bisa dilanjutkan).

## 7. Bila Buntu: Tindakan yang Benar
| Situasi | Tindakan |
|---|---|
| Endpoint yang dibutuhkan tidak ada | `numa block --reason` |
| Path atau menu salah di file milik task lain | Laporkan di `--summary`, jangan ditambal |
| Arah desain tidak ada di `numa context` | Pakai token dan komponen dari Fondasi UI; jangan mengarang palet baru |
| Pemeriksaan gaya gagal di file milik task lain | Laporkan di `--summary`, jangan diubah |
| Acceptance Criteria bertentangan dengan kontrak bersama | Ikuti kontrak bersama, catat penyimpangannya di `--summary` |

Urutan prioritas bila aturan bertentangan: kontrak bersama (peta halaman, kontrak UI shell, kontrak arsitektur), lalu Acceptance Criteria task, lalu isi skill.

## 8. Mode Eksekusi dan Akhir Layer
Mode aktif ditentukan oleh Master Prompt yang diberikan user. Setelah `numa done`, CLI menampilkan `Layer X selesai` bila task tadi yang terakhir di layernya (BOOTSTRAP, DATABASE, BACKEND, FRONTEND, INTEGRATION).
- **Dengan konfirmasi per layer** (default): kerjakan seluruh task satu layer tanpa berhenti. Saat layer selesai, BERHENTI, tampilkan ringkasan hasil layer (task selesai, berkas utama, hasil verifikasi), dan minta konfirmasi user di percakapan sebelum `numa next` untuk layer berikutnya. Jangan lanjut tanpa jawaban setuju.
- **Otomatis penuh**: jangan meminta konfirmasi di akhir layer maupun per task. Lanjutkan `numa next` sampai semua task DONE; berhenti hanya bila macet (`numa block`) atau gagal tanpa jalan keluar. Laporkan ringkasan sekaligus di akhir.
- Bila Master Prompt tidak menyebut mode, perlakukan sebagai "dengan konfirmasi per layer".
- Tidak ada persetujuan di web: konfirmasi hanya terjadi di percakapan dengan user.

## 9. Kejujuran Laporan
- Laporkan error apa adanya. Dilarang membuat mock fallback yang menyembunyikan kegagalan, dan dilarang mengklaim test lulus bila tidak dijalankan.
- Ringkasan `--summary` berisi: apa yang diubah, bagaimana diverifikasi, dan keputusan yang menyimpang dari spesifikasi.
- Gunakan `--commit` bila user menginginkan conventional commit otomatis per task; jangan melakukan commit atau push di luar itu tanpa diminta.

## 10. Keamanan Operasional
- Login terjadi otomatis di pemakaian pertama lewat browser: CLI menampilkan alamat dan kode, dan USER menyetujuinya di browser. Jangan meminta, menampilkan, atau menyalin token; jangan menulisnya ke berkas atau log. Bila CLI berhenti menunggu persetujuan, minta user menyetujui lalu jalankan ulang perintah yang sama.
- Kerjakan hanya project aktif (`numa switch <id>`). Jangan mengakses project lain dan jangan mengubah `.numa/workspace.json` secara manual.
- Setelah semua task selesai, jalankan `numa sync` agar server mencatat ringkasan workspace untuk siklus perubahan berikutnya.

## 11. Checklist Sebelum `numa done`
- [ ] Acceptance Criteria terpenuhi dan dibuktikan dengan test atau pengecekan nyata.
- [ ] Hanya file dalam lingkup yang berubah (`git status` bersih dari file lain).
- [ ] Validation commands lulus di lokal.
- [ ] Tidak ada secret, `console.log` debug, kode mati, atau TODO tanpa tiket.
- [ ] Ringkasan menjelaskan penyimpangan dari spesifikasi, bila ada.
- [ ] Tidak ada tambalan: halaman redirect, file setara dengan nama lain, atau endpoint buatan task FRONTEND.
