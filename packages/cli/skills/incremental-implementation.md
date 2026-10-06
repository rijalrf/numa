---
name: numa-incremental
description: Pedoman implementasi bertahap dalam irisan vertikal kecil, terisolasi, dan siap rilis per task.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Implementasi Bertahap Numa

## Aturan Bounded Context
- Kerjakan hanya file pada `files_to_create` dan `files_to_modify`.
- Dilarang menyentuh file pada daftar `forbidden`.
- Jangan mengubah konfigurasi build, dependensi, atau skema yang bukan bagian task aktif. Bila task benar-benar membutuhkannya, jelaskan di ringkasan atau `numa block`.
- Jangan refactor kode lain "sekalian". Perubahan di luar task membuat review dan rollback sulit.

## Irisan Vertikal
- Selesaikan satu kemampuan end-to-end per task mengikuti layering kontrak arsitektur (repository, service, controller, UI), bukan seluruh layer horizontal sekaligus.
- Tulis kode terkecil yang memenuhi Acceptance Criteria. Hindari abstraksi, flag konfigurasi, dan generalisasi untuk kebutuhan yang belum diminta.
- Setiap task meninggalkan aplikasi dalam keadaan bisa dibangun, dijalankan, dan lulus test. Jangan menyisakan kode setengah jadi untuk "dilanjutkan task berikutnya".

## Urutan Kerja yang Disarankan
1. Pahami Acceptance Criteria dan dependensi (`depends_on`) yang sudah DONE. Baca kode yang sudah ada sebelum menulis yang baru, dan ikuti konvensi penamaan serta gaya yang berlaku.
2. Tulis test gagal untuk kriteria utama (skill numa-tdd).
3. Implementasi minimal hingga hijau, lalu rapikan.
4. Jalankan lint, type check, dan test lokal. Perbaiki seluruh peringatan baru yang Anda timbulkan.
5. Tinjau diff sendiri sebelum `numa done`: hapus debug, kode mati, dan perubahan tak sengaja.

## Keamanan Perubahan
- Gunakan nilai default yang aman dan perubahan yang mudah di-rollback. Migrasi database bersifat aditif (tambah kolom nullable atau berdefault) kecuali task meminta lain.
- Jangan menghapus atau mengganti nama API publik, kolom, atau route yang sudah dipakai task DONE tanpa instruksi eksplisit.
- Tambahkan dependensi baru hanya bila benar-benar perlu, pilih paket yang terpelihara, dan kunci versinya melalui lockfile. Sebutkan alasannya di ringkasan.

## Konsistensi Lintas Task
- Gunakan kembali komponen, util, tipe, dan skema validasi yang dibuat task sebelumnya; jangan menduplikasi.
- Satu konsep satu nama di seluruh stack (database, API, UI). Jangan menamai ulang konsep yang sudah ada.
- Pesan commit (bila `--commit`): conventional commit, satu task satu commit, deskripsi singkat dan spesifik.
