# Rencana Migrasi Pembayaran: Midtrans ke Mayar.id

Tanggal: 2026-10-06. Cakupan: `apps/api` (billing), `apps/web` (pricing dan halaman langganan), Prisma, konfigurasi deploy, dokumen.

Status: **kode diimplementasikan** (langkah 1 sampai 6 selesai, diverifikasi dengan mock dan DB lokal). Sisa: langkah 7 sampai 10 (deploy, uji sandbox di UAT, go-live). Semua usulan di bagian 9 disetujui user pada 2026-10-06.

Catatan implementasi: payload webhook hanya dipakai mencari pembayaran lokal (`data.transactionId`, `data.id`, `data.paymentLinkId`); event selain `payment.received` diabaikan, event tanpa nama tetap diproses karena status selalu dikonfirmasi ke API. Perbandingan `paymentLink.id` pada konfirmasi tidak dipakai karena transaksi diambil lewat id yang kita simpan sendiri.

## 1. Latar belakang

Pembayaran saat ini memakai Midtrans Snap, tetapi belum pernah aktif di server UAT. Env `MIDTRANS_*` tidak diteruskan oleh `docker-compose.prod.yml`, sehingga checkout dan webhook selalu menjawab 503. Keputusan terbaru: gateway diganti ke **Mayar.id**.

Hal yang wajib dipertahankan dari Fase 1 rencana kesiapan produksi:
- Webhook idempoten: hanya pembayaran berstatus `pending` yang diproses.
- Nominal yang dibayar dicocokkan dengan nominal tersimpan.
- Keaslian webhook diverifikasi.
- Update `Payment` dan `Subscription` dalam satu transaksi, dengan klaim `where { id, status: 'pending' }`.
- Body webhook divalidasi Zod. Aksi penting dicatat lewat `recordAudit`.

## 2. Ringkasan API Mayar (hasil riset dokumentasi resmi)

Sumber: [docs.mayar.id](https://docs.mayar.id), terutama halaman API V2, migrasi V1 ke V2, dan webhook.

| Hal | Detail |
|---|---|
| Versi API | **Wajib V2.** V1 dinyatakan deprecated per 1 Oktober 2026 dan endpoint `/hl/v1/*` berhenti bekerja. |
| Base URL | Produksi `https://api.mayar.id/hl/v2`, sandbox `https://api.mayar.io/hl/v2`. |
| Akun sandbox | `https://web.mayar.io` (API key di `/api-keys`). Produksi di `https://web.mayar.id`. Key produksi hanya untuk `api.mayar.id`, key sandbox hanya untuk `api.mayar.io`. |
| Autentikasi | Header `Authorization: Bearer <API_KEY>`. Key harus bertipe **Read & Write** agar bisa memanggil POST. |
| Format respons | Amplop `{ statusCode, messages, data }`. |
| Batas laju | 50 request per menit per API key. Lewat batas dibalas 429 dengan header `Retry-After`. |
| Buat tagihan | `POST /payments/create` (Single Payment Request). Wajib `name` dan `amount`. Opsional `email`, `mobile`, `description`, `redirectUrl`, `expiredAt`, `extraData`. Respons: `data.id`, `data.transactionId`, `data.link`. |
| Cek status | `GET /payments/{id}` (status `unpaid`/`paid`/...) dan `GET /transactions/{id}` (status, `amount`, `paymentMethod`, `paymentLink.id`). |
| Simulasi bayar | `POST /payments/simulate`, **hanya sandbox** (di produksi dibalas 403). |
| Webhook | POST JSON ke URL yang didaftarkan di dashboard (Integration, Webhook) atau lewat `POST /webhooks/update`. Event yang relevan: `payment.received` (pembayaran selesai), `payment.reminder` (belum bayar setelah 29 menit). Tes URL lewat `POST /webhooks/test`. |
| Biaya dan kebijakan | Mayar bertindak sebagai Merchant of Record untuk produk digital. Akun produksi perlu verifikasi bisnis (lihat halaman Fees, Acceptable Use, Account Review). |

### Celah dokumentasi yang harus dipastikan di sandbox

Dokumentasi resmi **tidak menjelaskan mekanisme verifikasi keaslian webhook** (tidak ada signature HMAC seperti Midtrans). Sumber pihak ketiga menyebut token merchant dikirim di header `X-Callback-Token`, tetapi itu belum terkonfirmasi dari dokumen resmi. Selain itu:
- Tabel parameter menyebut `data.status` bertipe Boolean, tetapi contoh payload dari sumber lain berisi string `"SUCCESS"`.
- Belum jelas field mana di payload `payment.received` yang merujuk ke payment request kita (`data.id`, `data.transactionId`, atau `data.productId`).
- `redirectUrl` pada payment request bisa ditolak dengan 400 bila platform tidak dapat menyimpannya.

Karena itu desain di bawah **tidak memercayai isi payload webhook**. Webhook hanya menjadi pemicu, lalu server memeriksa status langsung ke API Mayar.

## 3. Desain solusi

### 3.1 Alur checkout

1. User memilih paket di `PricingDialog` atau `/settings/billing`, frontend memanggil `POST /api/billing/checkout` (kontrak tidak berubah: respons tetap `{ redirectUrl }`).
2. Server mengecek pembayaran `pending` milik user untuk paket yang sama yang belum kedaluwarsa. Bila ada, link lama dikembalikan. Ini mencegah tagihan ganda saat tombol diklik dua kali dan menghindari 429 "Duplicate request" dari Mayar.
3. Bila tidak ada, server membuat record `Payment` berstatus `pending` lebih dulu (agar `paymentId` internal bisa dikirim sebagai `extraData`), lalu memanggil `POST /payments/create`:
   - `name`: `Langganan Numa <Paket> (1 Bulan)`
   - `amount`: `PLANS[plan].price`
   - `email`: email user
   - `description`: ringkasan paket
   - `redirectUrl`: `${FE_URL}/settings/billing?payment=<paymentId>`
   - `expiredAt`: sekarang + 24 jam (nilai dikonfirmasi, lihat bagian 9)
   - `extraData`: `{ paymentId, userId, plan }`
4. `data.id`, `data.transactionId`, dan `data.link` disimpan ke `Payment`. Bila Mayar gagal, record ditandai `failed` dan API membalas 502 dengan pesan eksplisit (tanpa mock fallback).
5. Respons ke frontend: `{ paymentId, redirectUrl: data.link }`. Frontend tetap mengarahkan browser ke link tersebut.

### 3.2 Alur webhook (`POST /api/billing/webhook`)

1. Bila `MAYAR_API_KEY` atau `MAYAR_WEBHOOK_TOKEN` kosong: 503.
2. Verifikasi token webhook terhadap `MAYAR_WEBHOOK_TOKEN` dengan `crypto.timingSafeEqual`, setelah `trim()` kedua sisi. Gagal: 401 dan log `warn`. Lokasi token (header) dipastikan di sandbox.
3. Validasi body dengan Zod yang longgar (`event` string, `data` objek dengan id transaksi). Body tidak valid: 400.
4. Event selain `payment.received` dibalas `200 { ok: true, ignored: true }`.
5. Cari `Payment` berdasarkan id transaksi atau id payment request yang tersimpan. Tidak ditemukan: 404 dan log `warn`.
6. Bila `payment.status !== 'pending'`: `200 { ok: true, duplicate: true }`.
7. **Konfirmasi ke Mayar**: panggil `GET /transactions/{transactionId}` (atau `GET /payments/{id}`). Status `paid` dianggap berhasil. Nominal dari API dicocokkan dengan `payment.amount`, dan `paymentLink.id` dicocokkan dengan `providerRef`. Nominal tidak cocok: 400 plus audit `billing.webhook.amount_mismatch` (sama seperti sekarang).
8. Bila berhasil: transaksi Prisma yang sama seperti sekarang. Klaim `updateMany where { id, status: 'pending' }`, set `success`, `paymentType` dari `paymentMethod`, `transactionAt`, lalu upsert `Subscription` (paket, `quotaUsed` 0, `quotaMax`, `expiresAt` +30 hari). Audit `billing.payment.success`.
9. Gagal menghubungi Mayar saat konfirmasi: balas 502 agar Mayar mengulang pengiriman. Status tetap `pending`.

### 3.3 Sinkronisasi saat user kembali (rekonsiliasi)

Webhook bisa terlambat atau hilang. Ditambahkan endpoint `POST /api/billing/payments/:id/sync` (`requireUser`, hanya pemilik pembayaran):
- Bila masih `pending`, server memeriksa status ke Mayar dan menerapkan logika yang sama dengan langkah 7 dan 8 di atas (fungsi bersama, bukan duplikasi).
- Bila sudah melewati `expiredAt` dan belum dibayar, status menjadi `expired`.
- Respons: status pembayaran terkini.

Frontend `/settings/billing` membaca query `?payment=<id>`, memanggil sync, menampilkan status ("Pembayaran berhasil", "Menunggu pembayaran", "Pembayaran kedaluwarsa"), lalu meng-invalidate query `user-plan`.

### 3.4 Pemetaan status

| Sumber Mayar | Status `Payment` |
|---|---|
| `paid` | `success` |
| `unpaid` dan belum lewat `expiredAt` | `pending` |
| `unpaid` dan sudah lewat `expiredAt`, atau `closed` | `expired` |
| Gagal membuat tagihan | `failed` |

## 4. Perubahan per berkas

### API

| Berkas | Perubahan |
|---|---|
| `apps/api/src/lib/mayar.ts` (baru) | Klien Mayar: `getMayarConfig()` (base URL dari env), `createPaymentRequest()`, `getTransaction()`/`getPaymentRequest()`, `verifyWebhookToken()` (constant-time), `WebhookBodySchema`, `classifyMayarStatus()`. Timeout fetch, log error tanpa membocorkan API key. |
| `apps/api/src/lib/midtrans.ts` | Dihapus. |
| `apps/api/src/lib/__tests__/midtrans.test.ts` | Dihapus, diganti `mayar.test.ts`. |
| `apps/api/src/routes/billing.ts` | Checkout dan webhook ditulis ulang sesuai bagian 3. Tambah endpoint sync. Logika penerapan pembayaran diekstrak ke satu fungsi bersama (dipakai webhook dan sync). Komentar header diganti dari Midtrans ke Mayar. |
| `apps/api/src/lib/env.ts` | Peringatan `MIDTRANS_SERVER_KEY` diganti peringatan `MAYAR_API_KEY` dan `MAYAR_WEBHOOK_TOKEN`. |
| `apps/api/src/app.ts` | Tidak berubah. Pengecualian rate limit `billing/webhook` tetap berlaku. |
| `apps/api/src/routes/__tests__/http.test.ts` | Tes 503/400 memakai env Mayar. Tambah tes 401 untuk token salah dan tes event selain `payment.received` diabaikan. |

### Database (Prisma)

Model `Payment` dibuat netral terhadap provider (usulan, lihat keputusan di bagian 9):

```prisma
model Payment {
  id               String    @id @default(cuid())
  userId           String
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider         String    @default("mayar")
  providerRef      String?   @unique // id payment request Mayar
  providerTxId     String?   @unique // transactionId Mayar
  checkoutUrl      String?
  amount           Int
  plan             String
  status           String    @default("pending") // pending | success | failed | expired
  paymentType      String?
  expiresAt        DateTime?
  transactionAt    DateTime?
  createdAt        DateTime  @default(now())

  @@index([userId, status])
}
```

Migrasi baru:
- `midtransId` di-rename menjadi `providerRef` (data lama tetap ada).
- Tambah kolom `provider` (default `mayar`; baris lama diisi `midtrans`), `providerTxId`, `checkoutUrl`, dan `expiresAt`.
- Ganti indeks sesuai skema baru.

`Subscription` tidak berubah.

### Web

| Berkas | Perubahan |
|---|---|
| `apps/web/src/components/billing/pricing-dialog.tsx` | Kontrak checkout tetap. Hanya penyesuaian teks bila ada yang menyebut gateway. |
| `apps/web/src/pages/settings/billing.tsx` | Tangani `?payment=<id>`: panggil sync, tampilkan status dengan ikon `lucide-react`, invalidate `user-plan`, lalu hapus query dari URL. |

### Konfigurasi dan deploy

| Berkas | Perubahan |
|---|---|
| `.env.example` | Tambah `MAYAR_API_KEY=`, `MAYAR_WEBHOOK_TOKEN=`, `MAYAR_IS_PRODUCTION=false` (kosong, tanpa nilai asli). |
| `docker-compose.prod.yml` | Teruskan ketiga env tersebut ke service API (opsional, tidak `:?` wajib, agar deploy tidak gagal sebelum akun Mayar siap; tanpa key, billing menjawab 503 dan `env-check` memberi peringatan). |
| `.env` VPS | Diisi user sendiri. |

### Dokumen

- `AGENTS.md`:
  - Daftar env baru di "Aturan Penting".
  - Model `Payment` di tabel model data.
  - Catatan bahwa webhook dikonfirmasi ulang ke API Mayar.
- `docs/LAPORAN_PERUBAHAN.md`:
  - Bagian 2 (tagihan).
  - Langkah 5 panduan tes manual.
  - Bagian 12 (status env).
- `docs/PROD_READINESS_PLAN.md`: catatan di butir 1.1 bahwa gateway kini Mayar.
- `README.md`: bagian konfigurasi pembayaran, bila ada.

## 5. Urutan implementasi

| Langkah | Isi | Verifikasi |
|---|---|---|
| 0 | Persiapan akun (oleh user): daftar sandbox `web.mayar.io`, buat API key Read & Write, catat token webhook dari dashboard. | Key tersedia, tidak ditempel di chat atau repo. |
| 1 | Migrasi Prisma `Payment` dan regenerasi client. | `prisma validate`, migrasi lokal sukses. |
| 2 | `lib/mayar.ts` beserta unit test (token, klasifikasi status, parsing amplop respons, nominal). | `npm test` di API. |
| 3 | Tulis ulang `routes/billing.ts` (checkout, webhook, sync), hapus `lib/midtrans.ts`. | Typecheck, lint, knip bersih. |
| 4 | Env: `env.ts`, `.env.example`, `docker-compose.prod.yml`. | `env-check` memberi peringatan bila kosong. |
| 5 | Frontend: penanganan `?payment=` di `/settings/billing`. | Typecheck web. |
| 6 | Tes HTTP supertest (503, 401, 400, event diabaikan). | Seluruh CI lokal: audit, lint, knip, typecheck, build, test. |
| 7 | Uji sandbox lokal: jalankan API dengan key sandbox. Webhook diarahkan lewat tunnel atau langsung diuji di UAT (langkah 8). | Lihat bagian 6. |
| 8 | Perbarui dokumen (bagian 4). Commit, lalu push ke main (memicu deploy UAT). | Deploy hijau, `/health` 200. |
| 9 | Isi env sandbox di `.env` VPS, daftarkan URL webhook `https://numa.opendv.xyz/api/billing/webhook` di dashboard sandbox, lalu jalankan skenario uji UAT. | Bagian 6. |
| 10 | Go-live: verifikasi bisnis akun produksi, ganti ke key produksi, set `MAYAR_IS_PRODUCTION=true`, daftarkan webhook produksi. | Satu transaksi nyata nominal paket Starter. |

## 6. Skenario uji di UAT (sandbox)

| # | Skenario | Hasil yang diharapkan |
|---|---|---|
| 1 | Checkout Starter dari `/settings/billing` | Diarahkan ke halaman bayar Mayar sandbox. `Payment` `pending` dengan `providerRef`. |
| 2 | Klik checkout dua kali | Link yang sama dikembalikan, hanya satu `Payment`. |
| 3 | Bayar lewat `POST /payments/simulate` atau halaman sandbox | Webhook `payment.received` masuk, status `success`, paket menjadi Starter, `expiresAt` +30 hari, audit tercatat. |
| 4 | Kirim ulang webhook yang sama (`/webhooks/retry`) | `duplicate: true`, subscription tidak berubah. |
| 5 | Webhook dengan token salah (curl manual) | 401, tidak ada perubahan data. |
| 6 | Webhook palsu dengan token benar tetapi transaksi belum dibayar | Konfirmasi ke API menunjukkan `unpaid`, status tetap `pending`. |
| 7 | Webhook tidak terkirim (URL webhook sementara dikosongkan), user kembali lewat `redirectUrl` | Endpoint sync mendeteksi `paid` dan menerapkan paket. |
| 8 | Biarkan tagihan melewati `expiredAt` lalu buka `/settings/billing?payment=<id>` | Status `expired`, checkout baru membuat tagihan baru. |
| 9 | API key dikosongkan | Checkout dan webhook 503 dengan pesan jelas. Log startup memberi peringatan. |

Hal yang sekaligus dipastikan di sandbox (bagian 2), lalu hasilnya dicatat di dokumen ini:
- Nama header token webhook.
- Field id di payload webhook.
- Format `data.status`.
- Penerimaan `redirectUrl` pada payment request.

## 7. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Tidak ada signature resmi pada webhook | Webhook hanya pemicu. Status dan nominal selalu dikonfirmasi ke API Mayar dengan API key server. Token webhook menjadi lapisan tambahan. |
| `redirectUrl` ditolak untuk payment request | Fallback: pakai `POST /invoices/create` (mendukung `redirectUrl`, tetapi mewajibkan `mobile`), atau tetap tanpa redirect dan andalkan webhook plus tombol "Cek status pembayaran". Diputuskan setelah uji sandbox. |
| Rate limit 50 per menit | Checkout memakai ulang link pending. Sync dibatasi oleh `apiRateLimiter` yang sudah ada. |
| API V1 sudah mati | Hanya memakai `/hl/v2`. |
| Kebocoran API key di log | Logger hanya mencatat status dan potongan body respons, tidak pernah header. |
| Data `midtransId` lama | Migrasi rename menjaga data. DB dev sudah dikosongkan, dan Midtrans belum pernah aktif di UAT. |

## 8. Di luar cakupan

- Perpanjangan otomatis (recurring). Mayar punya produk Membership (SaaS), tetapi pemakaiannya mengubah model langganan Numa. Untuk sekarang tetap pembayaran manual per 30 hari, seperti saat ini.
- Refund dan pembatalan.
- Pembayaran per organisasi (tagihan tetap per user).

## 9. Keputusan yang perlu dikonfirmasi sebelum implementasi

| # | Keputusan | Usulan |
|---|---|---|
| 1 | Produk Mayar yang dipakai | Single Payment Request (`/payments/create`), karena `email` dan `mobile` opsional. Invoice mewajibkan nomor HP yang tidak kita punya. |
| 2 | Kode Midtrans | Dihapus total, tanpa lapisan abstraksi multi-provider. |
| 3 | Skema `Payment` | Rename `midtransId` menjadi `providerRef`, lalu tambah `provider`, `providerTxId`, `checkoutUrl`, dan `expiresAt`. |
| 4 | Nama env | `MAYAR_API_KEY`, `MAYAR_WEBHOOK_TOKEN`, dan `MAYAR_IS_PRODUCTION` (mengikuti pola env lama). |
| 5 | Masa berlaku tagihan | 24 jam. |
| 6 | Endpoint sync saat user kembali | Ditambahkan. |
| 7 | Env di compose produksi | Opsional (tidak menggagalkan deploy bila kosong). |
