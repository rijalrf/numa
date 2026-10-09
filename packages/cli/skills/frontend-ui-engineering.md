---
name: numa-frontend
description: Standar desain frontend dan konsistensi UI/UX - layout publik dan layout aplikasi, design token, pola komponen, state, formulir, tabel, aksesibilitas, responsif, dan performa.
---
<!-- Terinspirasi oleh frontend-design (https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design), (c) Anthropic PBC, all rights reserved. Konten ditulis ulang, bukan terjemahan. -->

# Standar Desain Frontend & Rekayasa Antarmuka Numa

## 1. Alur Dua Langkah (wajib)
**Langkah rencana** (sebelum menulis kode antarmuka):
- Baca Arah Desain dan Peta Halaman pada `numa context`. Bila Arah Desain kosong, pakai token netral dari Fondasi UI dan jangan mengarang palet baru.
- Tulis rencana singkat: token warna (primary, aksen, netral), pasangan font, kepadatan, dan konsep layout (wireframe ASCII beberapa baris untuk layout aplikasi dan satu halaman utama).

**Langkah eksekusi**:
- Bangun Fondasi UI lebih dulu (bagian 8), lalu susun setiap halaman dari komponen dan token itu.
- Setelah halaman jalan, periksa tampilannya lewat screenshot (bagian 14).

## 2. Desain Berdasarkan Subjek
- Sesuaikan nuansa dengan domain dan pengguna produk: perkakas data padat butuh kerapatan tinggi; aplikasi lapangan butuh target sentuh besar dan kontras tinggi; layanan publik butuh kesan tenang dan tepercaya.
- Identitas visual datang dari Arah Desain PRD, bukan dari preset template.

## 3. Prinsip Visual & Tipografi
- Maksimal 1-2 keluarga font dengan hirarki skala yang terdefinisi; batasi panjang baris baca di bawah 80 karakter.
- Garis pemisah, penomoran, dan label badge hanya dipakai bila data memang berurutan atau berkategori.
- Motion hanya untuk merespons interaksi atau memandu fokus; tidak ada animasi berulang pada setiap kartu.
- Biarkan satu elemen menjadi pusat perhatian visual per layar; sisanya tenang dan teratur.

## 4. Layout: Publik dan Aplikasi
Aplikasi hasil generate memakai dua layout yang terpisah. Sidebar HANYA ada di layout aplikasi.
- **Layout publik** (tanpa sidebar): beranda publik, login, daftar, lupa password, dan halaman galat.
  - Login, daftar, dan lupa password berupa kartu di tengah layar dengan nama aplikasi di atasnya.
  - Beranda publik memuat identitas aplikasi dan satu jalan masuk (tombol Masuk). Jangan menggandakan tombol Masuk di beberapa tempat pada layar yang sama.
- **Layout aplikasi** (dengan sidebar): semua halaman yang butuh login.
  - Sisi kiri: sidebar persisten berisi menu sesuai peran user, nama dan peran user, dan tombol Keluar.
  - Sisi kanan: area konten utama. Header hanya untuk konteks global (judul halaman aktif, status sistem, akun pengguna).
  - Responsif mobile: sidebar berubah menjadi drawer tersembunyi (toggle via hamburger) atau bottom navigation.
- Dilarang menaruh menu tamu (Masuk, Daftar) di dalam sidebar. Layout root hanya memuat provider global; pemilihan layout dilakukan per kelompok rute, bukan di layout root.
- Halaman yang butuh login dijaga di satu tempat (guard rute), bukan dicek terpisah di tiap halaman. Setelah login, user diarahkan ke halaman awal sesuai perannya.
- Bila PRD tidak meminta beranda publik, `/` berupa landing sederhana untuk tamu (nama aplikasi dan satu tombol Masuk). User yang sudah login yang membuka `/` diarahkan ke halaman awal sesuai perannya.
- Path halaman dan menu sidebar diambil dari satu sumber (satu file navigasi atau peta halaman pada `numa context`), tidak ditulis ulang di tiap komponen. Link atau redirect yang mengarah ke path yang tidak ada dibetulkan di sumbernya.

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
- Tampilan bawaan template: font sistem (Arial, Helvetica), palet warna Tailwind mentah (`slate`, `sky`, `rose`, dan sebagainya), serta kartu putih seragam di tengah latar abu-abu tanpa alasan domain.

## 7. Proses & Disiplin Eksekusi
- Rencana: Rumuskan palet warna token, jenis font, dan struktur layout sebelum menulis kode antarmuka.
- Tinjau: Pastikan layout memenuhi fungsi utama pengguna tanpa elemen dekoratif berlebih.
- Restraint: Biarkan satu fitur menjadi pusat perhatian visual, buat sisa antarmuka tenang dan teratur.
- Copywriting: Gunakan bahasa pengguna yang aktif, lugas, dan instruktif pada tombol aksi (misal: "Simpan perubahan", "Buat invoice baru").

## 8. Fondasi UI (wajib, dikerjakan sebelum halaman pertama)
Fondasi dibuat satu kali oleh task Fondasi UI; task halaman memakainya dan tidak membuat versi sendiri. Aturan yang diperiksa:
- Token desain ada di satu tempat (CSS variable atau konfigurasi Tailwind): warna (primary, surface, border, teks, success, warning, danger, info), radius, bayangan, tipografi, spacing. Nilainya mengikuti Arah Desain.
- Komponen tidak memakai warna palet bawaan Tailwind (`bg-sky-500`), nilai warna arbitrer (`bg-[#0ea5e9]`), atau hex mentah. Pelanggaran ini ditolak otomatis oleh `numa done`.
- Font dimuat lewat mekanisme font framework (bukan font sistem) sesuai Arah Desain.
- Pustaka komponen internal (`components/ui` atau padanannya) memuat minimal: Button, Input, Select, Textarea, Modal, Card, Badge, Table, Skeleton, EmptyState, AlertBanner, Toast. Halaman menyusun komponen ini, bukan menulis ulang tombol atau input.
- Layout publik dan layout aplikasi, guard rute, file navigasi, dan API client satu-satunya ada (bagian 4).
- Satu pustaka ikon dengan ukuran seragam; tanpa emoji di UI, kode, dan teks.
- Varian tombol terbatas dan bermakna (primary, secondary, ghost, destructive); satu aksi primer per layar; aksi destruktif memakai warna danger dan dialog konfirmasi yang menyebut nama objek.
- Satu istilah per konsep di seluruh UI; bahasa antarmuka mengikuti PRD (default Bahasa Indonesia).
- Mode terang dan gelap hanya bila produk dipakai lama (dashboard, back-office).

## 9. Pola Halaman Standar
- **Daftar (list)**: judul halaman dan aksi utama di kanan atas, kolom pencarian dan filter di atas tabel, tabel dengan sort pada kolom yang relevan, pagination, aksi baris lewat menu atau ikon ber-`aria-label`, dan empty state dengan ajakan aksi. Tabel di mobile berubah menjadi kartu atau dapat digulir horizontal di dalam wadahnya.
- **Detail**: breadcrumb, header berisi judul dan status (Badge), bagian terpisah dengan heading, aksi sekunder di menu.
- **Formulir**: label di atas input, teks bantuan di bawah, tanda wajib yang konsisten, validasi saat blur dan saat submit, pesan galat per field dengan `aria-describedby`, fokus berpindah ke field galat pertama, tombol submit menampilkan status proses (disabled plus indikator) agar tidak terkirim ganda, dan peringatan sebelum meninggalkan formulir yang belum disimpan.
- **Dashboard**: kartu ringkasan (angka utama plus konteks), maksimal satu grafik per pertanyaan bisnis, hindari dekorasi tanpa data.
- **Autentikasi**: layar login, daftar, dan lupa password memakai layout publik (kartu di tengah layar, tanpa sidebar); pesan galat umum yang tidak membuka detail akun; setelah login diarahkan ke halaman awal sesuai peran.
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
- [ ] Layout publik tanpa sidebar dan layout aplikasi dengan sidebar per peran dipakai pada halaman yang tepat; judul halaman, breadcrumb, dan istilah menu seragam.
- [ ] Semua link, menu, dan redirect mengarah ke path yang benar-benar ada; tidak ada halaman yang hanya berisi redirect untuk menutupi path yang salah.
- [ ] Empat state (loading skeleton, kosong, galat, sukses) ada pada setiap data yang dimuat.
- [ ] Formulir: label `htmlFor`, galat per field, status submit, tidak bisa terkirim ganda.
- [ ] Dapat dipakai dengan keyboard; kontras memadai; ikon-saja punya `aria-label`.
- [ ] Tampilan benar di mobile, tablet, dan desktop; tidak ada gulir horizontal.
- [ ] Semua teks UI Bahasa Indonesia (atau bahasa pada PRD), tanpa emoji, tanpa `alert()`.
- [ ] Tidak ada kelas warna palet bawaan Tailwind, warna arbitrer, atau hex mentah di halaman (diperiksa otomatis oleh `numa done`).
- [ ] Screenshot di lebar 390 px dan 1280 px sudah diambil dan diperiksa (bagian 14).

## 14. Pemeriksaan Tampilan (screenshot)
Setiap task halaman FRONTEND ditutup dengan memeriksa tampilan nyata, bukan hanya kode.
1. Jalankan aplikasi dan buka halaman task ini.
2. Ambil screenshot dengan Playwright (tersedia di semua golden stack) di lebar 390 px dan 1280 px. Simpan di `.numa/screenshots/` (folder ini tidak masuk git).
3. Lihat hasilnya (baca gambar bila agent Anda mampu) dan periksa: token dan komponen internal terpakai, layout publik atau aplikasi sesuai Peta Halaman, tidak ada gulir horizontal, state kosong dan galat terlihat wajar.
4. Perbaiki yang tidak lolos sebelum `numa done`. Bila agent Anda tidak bisa melihat gambar, periksa dengan cara lain (mis. uji lebar viewport lewat Playwright) dan tulis keterbatasannya di `--summary`.
