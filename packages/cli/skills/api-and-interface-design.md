---
name: numa-api-design
description: Standar perancangan API kontrak dan antarmuka integrasi yang konsisten dan type-safe.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Standar Desain API & Antarmuka Numa

## Format Respons RESTful
- Selalu kembalikan payload JSON terstruktur dengan HTTP status code yang representatif:
  - \`200 OK\` untuk pembacaan atau update berhasil.
  - \`201 Created\` untuk pembuatan resource baru.
  - \`400 Bad Request\` untuk kesalahan validasi payload input.
  - \`401 Unauthorized\` untuk sesi tidak terautentikasi.
  - \`403 Forbidden\` untuk akses resource di luar hak akses.
  - \`404 Not Found\` untuk resource yang tidak ditemukan.
  - \`409 Conflict\` untuk pelanggaran integritas (misal: menghapus resource dengan relasi aktif).
  - \`500 Internal Server Error\` untuk kesalahan server tak terduga.

## Format Error Terstandarisasi
\`\`\`json
{
  "error": "Pesan error manusiawi dalam Bahasa Indonesia",
  "code": "ERROR_CODE_STRING",
  "details": []
}
\`\`\`

## Validasi Input & Pagination
- Validasi seluruh body request menggunakan Zod schema sebelum masuk ke logika service.
- Semua endpoint daftar (GET collections) wajib menerima parameter query \`?page=1&limit=20\` dan mengembalikan metadata total halaman.
