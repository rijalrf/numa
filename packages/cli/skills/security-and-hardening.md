---
name: numa-security
description: Pengerasan keamanan aplikasi hasil generate - secret, autentikasi, otorisasi, validasi input, header, rate limit, data sensitif, dan dependensi.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Pengerasan Keamanan Numa

Anggap setiap input tidak tepercaya dan setiap token bisa bocor. Aplikasi dinilai enterprise-grade bila tetap aman ketika satu lapis gagal.

## Secret dan Konfigurasi
- DILARANG hardcode API key, token, secret JWT, atau password di kode, test, fixture, atau dokumen. Tidak ada fallback seperti `|| 'secret'`.
- Baca dari environment lewat modul konfigurasi tunggal yang memvalidasi saat start (Zod) dan gagal cepat bila variabel wajib kosong atau terlalu lemah.
- Sediakan `.env.example` berisi nama variabel tanpa nilai nyata. Pastikan `.env` ada di `.gitignore`.
- Jangan mencetak secret, token, atau header Authorization ke log maupun pesan error.

## Autentikasi
- Password di-hash dengan Argon2id atau bcrypt (cost minimal 12). Bandingkan dengan fungsi waktu konstan.
- Sesi memakai cookie `HttpOnly`, `Secure`, `SameSite=Lax` (atau `Strict`), atau token berumur pendek dengan mekanisme refresh dan pencabutan.
- Terapkan batas percobaan login dan penundaan bertahap. Pesan galat login tidak membedakan "email tidak ada" dan "password salah".
- Reset password dan verifikasi email memakai token acak sekali pakai berumur pendek, disimpan sebagai hash.

## Otorisasi (sumber kebocoran data terbesar)
- Otorisasi dicek di sisi server pada SETIAP endpoint dan SETIAP akses resource, bukan hanya menyembunyikan tombol di UI.
- Selalu batasi query dengan pemilik atau tenant dari sesi (`where: { id, ownerId }`). Jangan percaya `userId`/`tenantId` dari body atau query.
- Terapkan peran paling rendah yang cukup (least privilege). Aksi sensitif (hapus, ubah peran, ekspor data) dicatat di audit log: siapa, apa, kapan, dan sasaran.
- Resource milik pihak lain dijawab `404`, bukan `403`, agar keberadaannya tidak bocor.

## Validasi Input dan Injeksi
- Validasi tipe, panjang, rentang, dan format di batas masuk. Whitelist field yang boleh diubah (hindari mass assignment dari body mentah).
- Query database memakai parameter/ORM; dilarang menyusun SQL atau filter dari string input.
- Render keluaran dengan escaping bawaan framework. Dilarang `dangerouslySetInnerHTML`/`innerHTML` untuk data pengguna kecuali sudah disanitasi dengan pustaka terpercaya.
- Unggah berkas: batasi ukuran dan tipe berdasarkan isi (bukan hanya ekstensi), simpan di luar webroot dengan nama acak, jangan sajikan sebagai HTML.
- Request keluar ke URL buatan pengguna wajib divalidasi terhadap allowlist untuk mencegah SSRF.

## Lapisan Transport dan Browser
- CORS memakai allowlist origin eksplisit; jangan `*` dengan kredensial.
- Pasang header keamanan (misal lewat `helmet`): CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS di produksi.
- Lindungi mutasi berbasis cookie dari CSRF (token atau `SameSite` ketat plus pengecekan origin).
- Terapkan rate limit per IP dan per akun pada endpoint autentikasi, pencarian mahal, dan tulis massal.

## Data dan Transaksi
- Perubahan multi-langkah (stok, saldo, kuota, status) dalam satu transaksi database; baca dan tulis di transaksi yang sama untuk mencegah balapan.
- Enkripsi data sensitif (PII, kredensial pihak ketiga) saat disimpan bila diperlukan; jangan menyimpan data kartu.
- DELETE memeriksa relasi aktif dan menjawab `409` bila masih dipakai; pilih soft delete untuk data yang perlu jejak.
- Logging tidak memuat PII atau secret. Sediakan jalur ekspor dan hapus data pengguna bila aplikasi memproses data pribadi.

## Dependensi dan Rantai Pasok
- Kunci versi lewat lockfile, jalankan `npm audit` (atau setara) dan perbaiki kerentanan tinggi atau kritis.
- Tambahkan paket baru hanya bila perlu dan terpelihara; hindari paket tak dikenal dengan unduhan rendah.
- Image/container berjalan sebagai user non-root dengan base image minimal.

## Checklist
- [ ] Tidak ada secret di repo; konfigurasi divalidasi saat start.
- [ ] Setiap endpoint punya cek autentikasi dan otorisasi berbasis pemilik/tenant.
- [ ] Input divalidasi; tidak ada SQL string, `innerHTML` mentah, atau mass assignment.
- [ ] Rate limit pada login dan endpoint sensitif; CORS allowlist; header keamanan aktif.
- [ ] Aksi sensitif tercatat di audit log; galat tidak membocorkan detail internal.
