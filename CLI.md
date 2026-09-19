# Dokumentasi Lengkap CLI numa

CLI `numa` adalah antarmuka command-line yang digunakan oleh pengembang maupun AI coding agent (Claude Code, Cursor, Windsurf, Copilot) untuk mengeksekusi task-task implementasi proyek secara terisolasi dan otonom.

---

## 1. Konfigurasi & Penyimpanan Lokal

- **Lokasi File**: `~/.numa/config.json`
- **Izin Akses**: `0600` (hanya bisa dibaca dan ditulis oleh user pemilik sistem)
- **Struktur Data**:
  ```json
  {
    "apiUrl": "https://numa.mrijal.my.id",
    "token": "numa_...",
    "projectId": "cmtv6l8ar000je61qw5isl3v7",
    "activeTaskId": "cmtv..."
  }
  ```
- **Fallback URL**: `process.env.NUMA_API_URL` atau `http://localhost:6655`.

---

## 2. Instalasi CLI

### Di Laptop / Komputer Mana Saja (Tanpa Publish ke npm)
```bash
npm install -g https://numa.mrijal.my.id/api/download/numa.tgz
```
Perintah dipasang secara global (`-g`), sehingga langsung tersedia di semua direktori tanpa perlu instalasi ulang untuk proyek lain.

---

## 3. Daftar Lengkap Perintah CLI

### 1. `numa login <token>`
- **Deskripsi**: Menyimpan Personal Access Token (PAT) dan menghubungkan CLI ke server API.
- **Opsi**: `--api-url <url>` (menentukan URL server target, mis. `https://numa.mrijal.my.id`).
- **Alur Eksekusi**:
  1. Melakukan uji koneksi server ke endpoint `GET /health`.
  2. Menyimpan nilai `token` dan `apiUrl` ke dalam file `~/.numa/config.json`.
  3. Mengirim request ke `GET /api/agent/scopes` (header `Authorization: Bearer <token>`) untuk membaca seluruh proyek yang dapat diakses oleh token ini.
  4. Jika akun hanya memiliki satu proyek, otomatis menetapkan `projectId` aktif di file konfigurasi.

---

### 2. `numa switch [projectId]`
- **Deskripsi**: Berpindah konteks proyek aktif tanpa perlu login ulang.
- **Argumen**: `projectId` (opsional).
- **Alur Eksekusi**:
  1. Jika dipanggil tanpa argumen: menampilkan panduan cara penggunaan.
  2. Jika menyertakan `projectId`: menyimpan `projectId` ke file konfigurasi lokal, lalu memverifikasi akses via `GET /api/agent/whoami` dengan header `X-Project-ID: <projectId>`.

---

### 3. `numa whoami`
- **Deskripsi**: Menampilkan informasi token dan proyek yang sedang aktif.
- **Alur Eksekusi**:
  - Mengirim request ke `GET /api/agent/whoami`.
  - Menampilkan objek JSON berisi `id` dan `name` proyek aktif.

---

### 4. `numa next`
- **Deskripsi**: Mengambil task berikutnya yang harus dikerjakan.
- **Alur Eksekusi**:
  1. Mengirim request ke `GET /api/agent/tasks/next`.
  2. Memprioritaskan task yang berstatus `IN_PROGRESS`. Jika tidak ada, mengambil task `TODO` dengan urutan prioritas teratas.
  3. Menyimpan ID task ke `activeTaskId` di file konfigurasi lokal.
  4. Menampilkan nomor urut task, layer arsitektur (DATABASE / BACKEND / FRONTEND), status, judul, dan deskripsi task.

---

### 5. `numa start [id]`
- **Deskripsi**: Mengunci status task menjadi `IN_PROGRESS`.
- **Argumen**: `id` (opsional, default memakai `activeTaskId` dari konfigurasi lokal).
- **Alur Eksekusi**:
  - Mengirim request ke `POST /api/agent/tasks/:id/start`.
  - Server memperbarui status task di database menjadi `IN_PROGRESS`.

---

### 6. `numa context [id]`
- **Deskripsi**: Mengambil spesifikasi Bounded Context task aktif dalam format Markdown.
- **Argumen**: `id` (opsional, default memakai `activeTaskId`).
- **Alur Eksekusi**:
  - Mengirim request ke `GET /api/agent/tasks/:id/context`.
  - Server menghasilkan Markdown yang merinci:
    - **Acceptance Criteria**: Tolok ukur keberhasilan task.
    - **Allowed Files**: File yang boleh dibuat (`files_to_create`) atau dimodifikasi (`files_to_modify`).
    - **Forbidden Files**: File yang dilarang diubah demi menjaga integritas modul lain.
  - CLI mencetak Markdown ini ke terminal agar dibaca oleh AI agent sebelum menulis kode.

---

### 7. `numa done [id]`
- **Deskripsi**: Menandai task telah selesai diimplementasikan (`DONE`).
- **Argumen**: `id` (opsional, default memakai `activeTaskId`).
- **Alur Eksekusi**:
  1. Mengirim request ke `POST /api/agent/tasks/:id/complete`.
  2. Server mengubah status task menjadi `DONE`.
  3. Server memeriksa apakah seluruh task pada layer arsitektur saat ini telah rampung.
  4. Jika layer selesai, server mengembalikan `checkpointPending: true`. CLI akan memunculkan peringatan `CHECKPOINT PENDING` (AI agent wajib berhenti dan meminta izin user sebelum melanjutkan ke layer berikutnya).
  5. Jika bukan akhir layer, CLI memberi arahan untuk melanjutkan ke `numa next`.

---

### 8. `numa brd`
- **Deskripsi**: Mengunduh dan menampilkan Business Requirements Document (BRD) lengkap dalam format Markdown.
- **Alur Eksekusi**:
  - Mengirim request ke `GET /api/agent/brd`.
  - Mengonversi data BRD dari database (Ringkasan, Tujuan, Fitur, Tech Requirements, Non-Functional Requirements, Out of Scope) menjadi dokumen Markdown utuh ke terminal.

---

### 9. `numa status`
- **Deskripsi**: Menampilkan status diagnostik koneksi server dan sesi lokal.
- **Alur Eksekusi**:
  - Memeriksa endpoint `GET /health` di server.
  - Menampilkan status server (`OK` atau `TIDAK TERHUBUNG`), status token, `activeTaskId`, dan `projectId`.

---

### 10. `numa logout`
- **Deskripsi**: Menghapus konfigurasi dan token sesi lokal.
- **Alur Eksekusi**:
  - Menghapus file `~/.numa/config.json`.

---

## 4. Pola Eksekusi AI Coding Agent (Loop Otonom)

AI Coding Agent mengeksekusi siklus 4 tahap secara berulang:

1. `numa next` -> Mengambil task aktif berikutnya.
2. `numa start` -> Mengunci task menjadi IN_PROGRESS.
3. `numa context` -> Membaca batasan file dan kriteria keberhasilan.
4. Tulis & uji kode secara lokal sesuai kriteria.
5. `numa done` -> Menandai task selesai dan mengecek checkpoint gate.
