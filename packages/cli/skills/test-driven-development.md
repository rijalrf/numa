---
name: numa-tdd
description: Alur Test-Driven Development untuk memverifikasi fungsionalitas sebelum dan sesudah kode ditulis.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Prinsip Test-Driven Development (TDD) Numa

## Alur Inti
1. **Red**: Tulis unit test atau integration test terkecil yang merefleksikan Acceptance Criteria dari task.
2. **Verify Red**: Jalankan test dan pastikan gagal karena fitur belum diimplementasikan.
3. **Green**: Tulis kode implementasi seminimal mungkin hingga test lolos.
4. **Refactor**: Rapikan kode sesuai kontrak arsitektur tanpa mengubah perilaku fungsional.

## Aturan Verifikasi
- Setiap endpoint baru wajib memiliki minimal 1 automated test yang memverifikasi status code dan format JSON.
- Edge cases (input tidak valid, relasi hilang, error autentikasi) wajib diuji respons error-nya.
- Jalankan validation_commands lokal sebelum menandai selesai dengan \`numa done\`.
