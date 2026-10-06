---
name: numa-tdd
description: Alur Test-Driven Development dan standar pengujian agar setiap task terverifikasi dan tidak merusak task lain.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Test-Driven Development Numa

## Alur Inti
1. **Red**: tulis test terkecil yang mencerminkan satu Acceptance Criteria.
2. **Verify Red**: jalankan dan pastikan gagal karena fitur belum ada, bukan karena kesalahan test atau setup.
3. **Green**: tulis implementasi paling sederhana hingga test lulus.
4. **Refactor**: rapikan sesuai kontrak arsitektur tanpa mengubah perilaku. Test harus tetap hijau.

## Apa yang Wajib Diuji
- Setiap endpoint baru: status code sukses, format body JSON, validasi input salah (400), tidak terautentikasi (401), tidak berhak (403), tidak ditemukan (404), dan konflik (409) bila relevan.
- Logika bisnis (service): jalur normal, batas nilai, dan kegagalan. Uji perilaku, bukan detail implementasi.
- Operasi atomik (stok, saldo, kuota): uji bahwa kegagalan di tengah tidak meninggalkan data setengah jadi.
- Komponen UI yang memuat data: state loading, kosong, error, dan sukses (lihat skill numa-frontend). Interaksi utama form: validasi, submit, dan pesan galat.
- Pada task INTEGRATION: satu atau lebih alur pengguna kritis end-to-end.

## Kualitas Test
- Deterministik: tanpa ketergantungan waktu nyata, urutan eksekusi, jaringan eksternal, atau data sisa dari test lain. Bekukan waktu dan acak bila perlu.
- Mandiri: setiap test menyiapkan dan membersihkan datanya sendiri. Database test terpisah dari dev dan produksi.
- Satu test satu alasan gagal, dengan nama yang menjelaskan skenario dan hasil yang diharapkan.
- Mock hanya batas eksternal (HTTP pihak ketiga, email, pembayaran). Jangan me-mock kode yang sedang diuji.
- Dilarang melewati, menonaktifkan (`skip`, `xit`), atau melemahkan assertion agar test lulus.

## Verifikasi Sebelum Selesai
- Jalankan `validation_commands` task dan seluruh suite test proyek yang relevan. Task tidak boleh membuat test task lain merah.
- Pastikan juga type check dan lint lulus bila proyek memilikinya.
- Jangan menandai selesai dengan `numa done` bila test belum dijalankan. Laporkan hasil sebenarnya, termasuk test yang gagal.
- Bila bug ditemukan di luar lingkup task, catat di ringkasan; jangan memperbaikinya diam-diam.
