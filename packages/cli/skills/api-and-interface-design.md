---
name: numa-api-design
description: Standar kontrak API yang konsisten, aman, dan stabil - status code, format error, validasi, pagination, idempotensi, versi, dan dokumentasi.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Desain API dan Antarmuka Numa

Kontrak API adalah janji kepada UI dan pihak lain. Ikuti konvensi yang sudah ada di proyek lebih dulu; aturan di bawah mengisi bagian yang belum ditetapkan.

## Status Code
- `200` baca atau update berhasil; `201` resource dibuat; `204` berhasil tanpa body.
- `400` payload tidak valid; `401` belum terautentikasi; `403` terautentikasi tetapi tidak berhak.
- `404` tidak ditemukan (juga untuk resource milik tenant lain agar keberadaannya tidak bocor).
- `409` konflik integritas (duplikat, hapus resource yang masih punya relasi aktif).
- `422` hanya bila proyek sudah memakainya untuk validasi semantik; selebihnya gunakan `400`.
- `429` terkena rate limit, sertakan header `Retry-After`.
- `500` galat tak terduga. `502/503/504` untuk dependensi eksternal yang gagal.

## Format Error Tunggal
```json
{
  "error": "Pesan manusiawi dalam Bahasa Indonesia",
  "code": "KODE_ERROR_STABIL",
  "details": [{ "field": "email", "message": "Format email tidak valid" }],
  "requestId": "id-korelasi-opsional"
}
```
- `code` stabil dan dapat dipakai UI untuk logika. `error` boleh berubah redaksinya.
- Jangan membocorkan stack trace, query SQL, path server, atau pesan internal ke klien. Detail lengkap hanya di log server.

## Validasi dan Konsistensi
- Validasi seluruh body, query, dan params dengan skema (Zod atau setara) di batas masuk sebelum logika bisnis. Tolak field tak dikenal pada operasi tulis yang sensitif.
- Tipe respons konsisten: tanggal ISO 8601 UTC, uang dalam satuan terkecil (integer) atau decimal string, id bertipe sama di seluruh API.
- Nama resource jamak dan kata benda (`/projects/:id/tasks`), method sesuai makna: GET aman, PUT/DELETE idempoten, POST untuk pembuatan.
- Bentuk respons yang sama untuk operasi sejenis. Jangan mengembalikan field internal (hash password, token, flag admin) dari serializer.

## Pagination, Filter, dan Sort
- Endpoint daftar yang dapat tumbuh tanpa batas wajib terpaginasi: `?page=1&limit=20` dengan batas atas `limit` (mis. 100), atau cursor untuk data besar.
- Respons memuat metadata: `total`, `page`, `limit`, `totalPages` (atau `nextCursor`).
- Urutan default eksplisit dan stabil (mis. `createdAt desc, id desc`). Filter dan sort hanya pada field yang diizinkan.
- Pengecualian: daftar kecil yang terbatas secara alami (mis. opsi dropdown) boleh tanpa pagination bila batas jumlahnya terjamin.

## Idempotensi dan Konkurensi
- Operasi yang berisiko dobel kirim (pembayaran, pembuatan pesanan) menerima header `Idempotency-Key` dan mengembalikan hasil yang sama untuk kunci yang sama.
- Update yang rawan bentrok memakai versi/`updatedAt` (optimistic locking) dan menjawab `409` bila basi.
- Operasi panjang (>~2 detik) dijalankan asinkron: kembalikan `202` beserta id job dan endpoint status.

## Evolusi Kontrak
- Perubahan yang tidak kompatibel memakai versi (`/api/v2/...`) atau field baru yang opsional. Menambah field aman; menghapus atau mengubah arti field tidak.
- Setiap endpoint punya contoh request/respons yang terdokumentasi (OpenAPI atau README API) dan tercermin di test.

## Paritas dengan UI
- Setiap endpoint mutasi harus punya pemicu antarmuka nyata, dan UI hanya memanggil endpoint yang ada. Daftarkan di `consumesApis` pada task FRONTEND.
