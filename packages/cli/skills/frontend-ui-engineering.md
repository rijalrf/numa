---
name: numa-frontend
description: Panduan desain frontend yang disengaja dan anti-template untuk aplikasi hasil generate Numa.
---
<!-- Terinspirasi oleh frontend-design (https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design), (c) Anthropic PBC, all rights reserved. Konten ditulis ulang, bukan terjemahan. -->

# Standar Desain Frontend & Rekayasa Antarmuka Numa

## 1. Peran & Pola Pikir
- Posisikan diri sebagai design lead: berikan produk identitas visual mandiri, bukan template pasaran.
- Hindari estetika klise AI generic: jangan gunakan preset styling seragam tanpa dasar kebutuhan spesifik.

## 2. Desain Berdasarkan Subjek
- Pahami konteks bisnis, target pengguna, dan alur kerja utama produk sebelum menentukan palette atau layout.
- Sesuaikan nuansa visual dengan domain produk (misal: perkakas finansial butuh kerapatan data tinggi; aplikasi operasional lapangan butuh target sentuh besar dan kontras tinggi).

## 3. Prinsip Visual & Tipografi
- Hero & Tampilan Pembuka: Buka halaman dengan elemen paling representatif dari domain aplikasi.
- Tipografi: Maksimal 1–2 keluarga font yang saling melengkapi dengan hirarki skala yang terdefinisi. Batasi panjang baris baca di bawah 80 karakter.
- Perangkat Struktur: Garis pemisah, penomoran (01, 02), dan label badge hanya dipakai jika data benar-benar memiliki urutan kronologis atau kategori penting.
- Animasi Hemat: Gunakan motion hanya untuk merespons interaksi pengguna atau memandu fokus perubahan state. Jangan beri animasi berulang pada setiap card.

## 4. Default App Shell (Layout Aplikasi)
- Aplikasi hasil generate WAJIB menggunakan **sidebar menu** sebagai layout standar:
  - Sisi kiri: navigasi sidebar persisten untuk menu modul/fitur.
  - Sisi kanan: area konten utama.
  - Sisi atas (header): hanya untuk konteks global (judul halaman aktif, status sistem, akun pengguna).
- Responsif mobile: sidebar berubah menjadi drawer tersembunyi (toggle via hamburger) atau bottom navigation.

## 5. Standar UI/UX Implementasi
- Spacing: Selalu gunakan kelipatan 4px (Tailwind: `gap-1`, `gap-2`, `p-3`, `p-4`, `p-6`, `space-y-4`).
- Status Komponen: Tangani seluruh state secara eksplisit:
  - Idle: tampilan default.
  - Loading: WAJIB gunakan skeleton loader (placeholder berdenyut), DILARANG memakai teks polos "Loading...".
  - Empty: ilustrasi atau teks penjelas aksi saat data kosong.
  - Error: tampilkan pesan kesalahan manusiawi melalui AlertBanner atau Toast (DILARANG menggunakan `window.alert()`).
- Aksesibilitas:
  - Setiap elemen `<label>` harus memiliki atribut `htmlFor` yang cocok dengan `id` input target.
  - Tombol aksi berbasis ikon tanpa teks wajib memiliki atribut `aria-label`.
- Paritas UI: Setiap endpoint mutasi backend (POST/PUT/PATCH/DELETE) harus memiliki pemicu antarmuka nyata (tombol/form/modal) yang dicatat di `consumesApis`.

## 6. Daftar Tanda Klise AI yang Dilarang
- Latar belakang krem kekuningan dengan aksen terakota tanpa alasan domain.
- Kartu SaaS seragam dengan rounded-corners identik di semua level komponen.
- Eyebrow text huruf kapital semua (ALL CAPS) di atas setiap judul heading.
- Penomoran dekoratif acak pada kartu non-sekuensial.

## 7. Proses & Disiplin Eksekusi
- Rencana: Rumuskan palet warna token, jenis font, dan struktur layout sebelum menulis kode antarmuka.
- Tinjau: Pastikan layout memenuhi fungsi utama pengguna tanpa elemen dekoratif berlebih.
- Restraint: Biarkan satu fitur menjadi pusat perhatian visual, buat sisa antarmuka tenang dan teratur.
- Copywriting: Gunakan bahasa pengguna yang aktif, lugas, dan instruktif pada tombol aksi (misal: "Simpan perubahan", "Buat invoice baru").
