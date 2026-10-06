---
name: numa-frontend
description: Standar desain frontend dan konsistensi UI/UX - app shell sidebar, design token, pola komponen, state, formulir, tabel, aksesibilitas, responsif, dan performa.
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

## 8. Design System dan Konsistensi (wajib, dibuat sebelum halaman pertama)
Sebelum membuat halaman, pastikan fondasi berikut ada. Bila belum, buat sebagai bagian task FRONTEND pertama, lalu pakai ulang di semua task berikutnya. Jangan membuat gaya lokal per halaman.
- **Design token** di satu tempat (CSS variables atau konfigurasi Tailwind): warna (primary, surface, border, teks, success, warning, danger, info), radius, bayangan, tipografi, spacing. Dilarang memakai nilai warna hex atau ukuran piksel mentah di komponen.
- **Mode terang dan gelap** bila produk dipakai lama (dashboard, back-office): token memiliki varian dan pilihan pengguna diingat.
- **Pustaka komponen internal** (mis. `components/ui`): Button, Input, Select, Textarea, Checkbox, Switch, Modal/Dialog, Drawer, Dropdown, Tabs, Badge, Card, Table, Pagination, Toast, AlertBanner, Skeleton, EmptyState, Breadcrumb. Halaman menyusun komponen ini, tidak membuat ulang tombol atau input sendiri.
- **Satu pustaka ikon** (mis. `lucide-react`). Ukuran ikon seragam (16, 20, 24). Dilarang emoji di UI, kode, dan teks.
- **Varian terbatas dan bermakna**: Button primary, secondary, ghost, destructive. Satu aksi primer per layar. Aksi destruktif memakai warna danger dan dialog konfirmasi yang menyebut nama objek yang dihapus.
- **Penamaan dan copy konsisten**: satu istilah per konsep di seluruh UI (jangan campur "Hapus", "Delete", "Buang"). Bahasa antarmuka mengikuti PRD (default Bahasa Indonesia). Judul halaman, label menu, dan breadcrumb memakai istilah yang sama.

## 9. Pola Halaman Standar
- **Daftar (list)**: judul halaman dan aksi utama di kanan atas, kolom pencarian dan filter di atas tabel, tabel dengan sort pada kolom yang relevan, pagination, aksi baris lewat menu atau ikon ber-`aria-label`, dan empty state dengan ajakan aksi. Tabel di mobile berubah menjadi kartu atau dapat digulir horizontal di dalam wadahnya.
- **Detail**: breadcrumb, header berisi judul dan status (Badge), bagian terpisah dengan heading, aksi sekunder di menu.
- **Formulir**: label di atas input, teks bantuan di bawah, tanda wajib yang konsisten, validasi saat blur dan saat submit, pesan galat per field dengan `aria-describedby`, fokus berpindah ke field galat pertama, tombol submit menampilkan status proses (disabled plus indikator) agar tidak terkirim ganda, dan peringatan sebelum meninggalkan formulir yang belum disimpan.
- **Dashboard**: kartu ringkasan (angka utama plus konteks), maksimal satu grafik per pertanyaan bisnis, hindari dekorasi tanpa data.
- **Autentikasi**: layar login, daftar, dan lupa password memakai satu layout; pesan galat umum yang tidak membuka detail akun.
- **Halaman galat**: 404, 403, dan galat tak terduga memiliki tampilan sendiri dengan jalan kembali yang jelas.

## 10. Umpan Balik dan State Lengkap
- Setiap data yang dimuat punya empat state: loading (skeleton sesuai bentuk konten), kosong, galat (dengan tombol Coba lagi), dan sukses. Dilarang layar putih saat memuat atau galat.
- Aksi pengguna mendapat umpan balik: Toast untuk sukses ringan, AlertBanner untuk galat yang butuh perhatian, dan dialog untuk konfirmasi destruktif. Dilarang `window.alert()`, `confirm()`, dan `prompt()`.
- Update optimistis hanya bila aksinya aman dibatalkan, dengan rollback dan pesan bila gagal.
- Galat dari API ditampilkan dengan pesan manusiawi dari field `error`, ditambah `requestId` bila ada untuk dukungan teknis. Jangan menampilkan stack trace atau kode HTTP mentah.
- Sesi berakhir (401) mengarahkan ke login dan mengingat halaman tujuan.

## 11. Aksesibilitas (target WCAG 2.1 AA)
- Seluruh fungsi dapat dipakai dengan keyboard: urutan tab logis, indikator fokus terlihat jelas, tidak ada jebakan fokus. Dialog memindahkan fokus ke dalamnya, menutup dengan Esc, dan mengembalikan fokus ke pemicu.
- Kontras teks minimal 4.5:1 (teks besar 3:1). Informasi tidak boleh hanya dibedakan oleh warna; sertakan ikon atau teks.
- Gunakan elemen semantik (`button`, `a`, `nav`, `main`, `table`, `h1`-`h3` berurutan). Tautan untuk navigasi, tombol untuk aksi.
- Gambar bermakna punya `alt`, dekoratif memakai `alt=""`. Status dinamis (toast, galat) diumumkan lewat `role="status"` atau `role="alert"`.
- Hormati `prefers-reduced-motion`: matikan animasi non-esensial.
- Target sentuh minimal 44x44 px pada tampilan mobile.

## 12. Responsif dan Performa
- Mobile-first dengan breakpoint terdefinisi di token. Uji pada lebar 360, 768, dan 1280 px; tidak ada gulir horizontal pada halaman.
- Kode dipecah per rute (lazy loading), gambar diberi dimensi dan dimuat malas, font memakai `font-display: swap` dan subset yang dibutuhkan.
- Data dari server dikelola lewat satu lapisan (mis. TanStack Query) dengan cache, deduplikasi, dan pembatalan; jangan memanggil API langsung di banyak komponen.
- Hindari render ulang besar: state diangkat seperlunya, daftar panjang divirtualisasi.

## 13. Checklist Sebelum `numa done` pada Task FRONTEND
- [ ] Memakai token dan komponen internal; tidak ada warna atau ukuran mentah dan tidak ada komponen duplikat.
- [ ] App shell sidebar konsisten; judul halaman, breadcrumb, dan istilah menu seragam.
- [ ] Empat state (loading skeleton, kosong, galat, sukses) ada pada setiap data yang dimuat.
- [ ] Formulir: label `htmlFor`, galat per field, status submit, tidak bisa terkirim ganda.
- [ ] Dapat dipakai dengan keyboard; kontras memadai; ikon-saja punya `aria-label`.
- [ ] Tampilan benar di mobile, tablet, dan desktop; tidak ada gulir horizontal.
- [ ] Semua teks UI Bahasa Indonesia (atau bahasa pada PRD), tanpa emoji, tanpa `alert()`.
