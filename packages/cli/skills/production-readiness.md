---
name: numa-production
description: Standar kesiapan produksi aplikasi hasil generate - konfigurasi, error handling, logging, health check, database, performa, CI, kontainer, dan dokumentasi operasional.
---

# Kesiapan Produksi Numa

Target: aplikasi yang bisa dideploy, dioperasikan, dan didiagnosis oleh tim lain tanpa membaca kode. Terapkan sesuai stack dan lingkup task; jangan menambah infrastruktur yang tidak diminta, tetapi jangan pula meninggalkan celah berikut pada fondasi aplikasi.

## 1. Konfigurasi
- Satu modul konfigurasi yang membaca environment, memvalidasi dengan skema, dan mengekspor objek bertipe. Gagal cepat saat start bila ada yang kurang.
- Pisahkan `development`, `test`, `production`. Tidak ada nilai produksi di kode.
- `.env.example` lengkap dengan komentar singkat tiap variabel. README menjelaskan variabel wajib dan opsional.

## 2. Penanganan Error
- Satu error handler terpusat di ujung pipeline. Controller async dibungkus agar tidak ada promise rejection yang lolos.
- Bedakan galat operasional (input salah, resource tidak ada, dependensi gagal) dari bug. Galat operasional dijawab dengan status dan kode yang sesuai; bug dijawab `500` generik dan dicatat lengkap.
- Tangani `unhandledRejection` dan `uncaughtException`: catat, lalu keluar dengan bersih agar proses di-restart orkestrator.
- Dependensi eksternal diberi timeout, retry terbatas dengan backoff, dan pesan galat eksplisit. Dilarang mock fallback yang menyamarkan kegagalan.

## 3. Logging dan Observabilitas
- Log terstruktur (JSON di produksi) dengan level, waktu, pesan, dan konteks. Gunakan satu pustaka logger, bukan `console.log` tersebar.
- Setiap request punya `requestId` (terima `X-Request-Id` bila ada, atau buat baru), disertakan di log dan di respons galat.
- Jangan mencatat secret, token, password, atau PII. Samarkan field sensitif.
- Sediakan metrik dasar bila stack mendukung: latensi, jumlah error per route, dan penggunaan sumber daya.

## 4. Health, Start, dan Shutdown
- `GET /health` (liveness, tanpa dependensi) dan `GET /ready` (cek database dan dependensi kritis).
- Graceful shutdown: tangkap `SIGTERM`/`SIGINT`, berhenti menerima koneksi baru, selesaikan request berjalan, tutup pool database, lalu keluar.
- Server mendengarkan `0.0.0.0` dan port dari environment, bukan nilai tetap di kode.

## 5. Database
- Skema hanya berubah lewat migrasi berversi yang disimpan di repo. Dilarang mengubah skema manual atau memakai `synchronize/auto-migrate` di produksi.
- Migrasi aditif dan kompatibel mundur; perubahan destruktif dipecah dalam beberapa rilis.
- Indeks untuk kolom yang dipakai filter, join, dan sort; kunci asing dan constraint unik/NOT NULL dinyatakan di skema.
- Hindari query N+1 (gunakan include/join atau batch). Batasi hasil daftar dengan pagination.
- Seed hanya untuk data dev/demo dan tidak berisi kredensial nyata.

## 6. Performa dan Ketahanan
- Pool koneksi dengan batas wajar, timeout request, dan batas ukuran body.
- Rate limit pada endpoint publik dan mahal; kompresi respons; cache hanya untuk data yang jelas aman (dengan strategi invalidasi tertulis).
- Pekerjaan lama atau mudah gagal (email, laporan, impor) dijalankan sebagai job latar dengan status yang bisa dipantau, bukan di dalam request.
- Frontend: pecah bundle per rute (lazy loading), optimalkan gambar, hindari render ulang berlebihan, dan ukur dengan Lighthouse untuk halaman utama.

## 7. Kualitas dan CI
- Skrip standar di `package.json` (atau setara): `lint`, `typecheck`, `test`, `build`. Semua harus lulus dari clone bersih.
- Sediakan pipeline CI yang menjalankan keempatnya, plus `npm audit` untuk kerentanan tinggi dan kritis. Merge ke cabang utama hanya bila hijau.
- Format kode otomatis (Prettier/formatter stack) dan aturan lint dikomit ke repo.

## 8. Kontainer dan Deploy
- `Dockerfile` multi-stage, user non-root, `.dockerignore` lengkap, healthcheck mengarah ke `/health`. Tidak ada secret di image atau build arg yang tersimpan di layer.
- `docker-compose.yml` untuk pengembangan lokal (aplikasi, database) dengan variabel dari `.env`.
- Image diberi tag versi atau commit SHA, bukan hanya `latest`. Sediakan langkah rollback di dokumentasi.

## 9. Dokumentasi Operasional
- `README.md` memuat: tujuan aplikasi, prasyarat, cara setup lokal, cara menjalankan test, variabel environment, cara migrasi dan seed, cara deploy, dan struktur folder singkat.
- Dokumentasi API (OpenAPI atau tabel endpoint) sinkron dengan kode.
- Catatan runbook singkat: cara membaca log, arti kode galat utama, cara backup dan restore database.

## 10. Aksesibilitas dan Kepatuhan Dasar
- UI memenuhi WCAG 2.1 AA pada alur utama (lihat skill numa-frontend).
- Bila memproses data pribadi: halaman kebijakan privasi, jalur ekspor dan hapus data, serta retensi log yang dinyatakan.

## Checklist Akhir Fitur
- [ ] Konfigurasi divalidasi; tidak ada nilai produksi di kode.
- [ ] Galat ditangani terpusat, tidak ada stack trace ke klien.
- [ ] Log terstruktur dengan requestId, tanpa data sensitif.
- [ ] Health dan ready tersedia; shutdown bersih.
- [ ] Skema berubah hanya lewat migrasi; indeks dan constraint ada.
- [ ] lint, typecheck, test, build lulus dari clone bersih; README dan `.env.example` mutakhir.
