---
name: numa-incremental
description: Pedoman implementasi kode bertahap dalam irisan vertikal kecil dan terisolasi.
---
<!-- Adapted from agent-skills (https://github.com/addyosmani/agent-skills), MIT License -->

# Prinsip Implementasi Bertahap (Incremental Implementation) Numa

## Aturan Bounded Context
- Kerjakan HANYA file yang tercantum pada \`files_to_create\` dan \`files_to_modify\`.
- DILARANG menyentuh file pada daftar \`forbidden\`.
- Jangan mengubah file konfigurasi build/project di luar lingkup task aktif.

## Irisan Vertikal (Vertical Slicing)
- Selesaikan satu fitur end-to-end (Repository -> Service -> Controller -> UI) secara berurutan per task.
- Hindari membuat abstraksi prematur atau boilerplate untuk kebutuhan masa depan yang belum diminta.
- Gunakan nilai default yang aman dan rollback-friendly jika terjadi kegagalan.
