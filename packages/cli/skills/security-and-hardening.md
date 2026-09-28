---
name: numa-security
description: Prinsip pengerasan keamanan kode sumber, credential, dan proteksi dari vulnerabilitas umum.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Pengerasan Keamanan (Security Hardening) Numa

## Aturan Kredensial & Secrets
- DILARANG KERAS hardcode API key, token, JWT secret, atau database password di kode sumber.
- Gunakan environment variable (\`process.env.VAR\`) dengan fallback aman atau lempar error jika variabel wajib tidak terisi.
- Password user wajib di-hash menggunakan algoritma aman (misal bcrypt dengan salt rounds minimal 10 atau Argon2).

## Proteksi Data & Transaksi
- Gunakan database transaction (\`prisma.$transaction\`) untuk setiap alur bisnis yang melibatkan perubahan stok, kuota, atau saldo.
- Terapkan sanitasi input dan validasi tipe ketat untuk mencegah SQL/NoSQL Injection dan XSS.
- Endpoint DELETE wajib memverifikasi ketiadaan foreign key atau data relasi yang bergantung sebelum melakukan penghapusan fisik.
