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

```bash
npm install -g numa-cli
```
Perintah dipasang secara global (`-g`), sehingga langsung tersedia di semua direktori tanpa perlu instalasi ulang untuk proyek lain. Executable terminal tetap `numa`.

---

## 3. Daftar Lengkap Perintah CLI

### 1. `numa login [token]`
- **Deskripsi**: Menyimpan Personal Access Token (PAT) dan menghubungkan CLI ke server API.
- **Sumber token** (urutan): argumen `token` (deprecated, tampil peringatan karena terekam di riwayat shell), variabel `NUMA_TOKEN`, lalu prompt tersembunyi. Cara yang dianjurkan: jalankan `numa login` tanpa argumen.
- **Opsi**: `--api-url <url>` (menentukan URL server target, mis. `https://numa.mrijal.my.id`).
- **Alur Eksekusi**:
  1. Melakukan uji koneksi server ke endpoint `GET /health`.
  2. Menyimpan nilai `token` dan `apiUrl` ke dalam file `~/.numa/config.json` (izin 0600).
  3. Mengirim request ke `GET /api/agent/scopes` untuk membaca proyek yang dapat diakses token ini. Token yang ditolak (dicabut/kedaluwarsa) tidak disimpan.
  4. Jika hanya ada satu proyek, otomatis menetapkan `projectId` aktif.
- **Masa berlaku token**: token baru berlaku 90 hari (maks 365). Token kedaluwarsa ditolak server (HTTP 401); buat token baru di halaman profil.

#### Konfigurasi berlapis
Prioritas dari tertinggi: environment (`NUMA_TOKEN`, `NUMA_API_URL`, `NUMA_PROJECT_ID`), lalu `.numa/workspace.json` (`{projectId, apiUrl}`, dicari naik dari direktori kerja, aman di-commit karena tanpa token), lalu `~/.numa/config.json`. `numa init` dan `numa switch` menulis `workspace.json` sehingga satu mesin dapat mengerjakan beberapa project paralel tanpa saling menimpa.

---

### 2. `numa switch [projectId]`
- **Deskripsi**: Berpindah konteks proyek aktif tanpa perlu login ulang. Akses diverifikasi dulu; project yang tidak boleh diakses tidak disimpan. Di dalam workspace Numa, `.numa/workspace.json` ikut diperbarui.
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
  - Mengirim request ke `POST /api/agent/tasks/:id/start`. Server menolak (HTTP 409) bila ada checkpoint pemblokir yang belum disetujui user.
  - Server memperbarui status task di database menjadi `IN_PROGRESS`.
  - CLI mencatat **baseline** ke `.numa/state.json`: SHA `HEAD` dan hash file yang sudah berubah sebelum task. Guard saat `done` hanya menilai perubahan sejak titik ini.
- **Opsi**: `--dir <path>` (default: direktori saat ini).

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
- **Deskripsi**: Menandai task selesai (`DONE`) setelah runtime scope guard lolos.
- **Argumen**: `id` (opsional, default memakai `activeTaskId`).
- **Opsi**: `--summary <teks>`, `--dir <path>`, `--commit` (conventional commit otomatis), `--allow-unlisted`, `--force`.
- **Alur Eksekusi**:
  1. Mengambil guard spec dari `GET /api/agent/tasks/:id/context`.
  2. **File terlarang**: file yang berubah sejak baseline (worktree, file baru, dan commit setelah baseline) dicocokkan dengan `forbidden`. Pelanggaran menghentikan `done` dan mencatat kegagalan (task menjadi `BLOCKED`).
  3. **File di luar lingkup**: file di luar `files_to_create` + `files_to_modify` hanya diperingatkan.
  4. **validation_commands**: dijalankan di workspace, tunduk pada kebijakan keamanan di bawah.
  5. Mengirim `POST /api/agent/tasks/:id/complete` beserta `guardReport` (file berubah, file di luar lingkup, hasil perintah, versi CLI). Server menyimpannya di `aiContext.completion`.
  6. Bila layer selesai, server mengembalikan `checkpointPending: true`; AI agent wajib berhenti sampai user menyetujui di web.
- **`--force`**: melewati guard, tetapi `forced: true` dicatat di server sebagai jejak audit.

#### Kebijakan validation_commands
Perintah berasal dari data task hasil AI sehingga tidak dipercaya begitu saja:
- Ditolak selalu: pipe, `||`, `;`, backtick, `$(...)`, redirect, `&`, multi-baris, dan program `sudo/su/ssh/scp/nc/dd/mkfs/eval/exec`.
- `&&` diperbolehkan; tiap segmen dicek. `cd` hanya ke folder relatif di dalam workspace.
- Program yang dikenal (npm, npx, pnpm, yarn, node, tsc, vitest, jest, playwright, pytest, go, php, composer, cargo, make, dst.) langsung jalan.
- Program lain butuh konfirmasi interaktif, atau `--allow-unlisted`. Di terminal non-interaktif tanpa flag, perintah ditolak.

---

### 8. `numa prd`
- **Deskripsi**: Mengunduh dan menampilkan Product Requirements Document (PRD) lengkap dalam format Markdown.
- **Alur Eksekusi**:
  - Mengirim request ke `GET /api/agent/prd`.
  - Mengonversi data PRD dari database (Ringkasan, Tujuan, Fitur, Tech Requirements, Non-Functional Requirements, Out of Scope) menjadi dokumen Markdown utuh ke terminal.

---

### 9. `numa status`
- **Deskripsi**: Menampilkan status diagnostik koneksi server dan sesi lokal.
- **Alur Eksekusi**:
  - Memeriksa endpoint `GET /health` di server.
  - Menampilkan versi CLI, status server (`OK` atau `TIDAK TERHUBUNG`), status token (disimpan atau dari `NUMA_TOKEN`), validitas akses token, `activeTaskId`, `projectId` beserta sumbernya (env/workspace/global), dan versi skill pack.

---

### 10. `numa logout`
- **Deskripsi**: Menghapus konfigurasi dan token sesi lokal.
- **Alur Eksekusi**:
  - Menghapus file `~/.numa/config.json`.

---

### 11. `numa retry [id]`
- **Deskripsi**: Mengembalikan task `BLOCKED` atau `IN_PROGRESS` ke `TODO` agar bisa diulang (`POST /api/agent/tasks/:id/retry`). Task `DONE`/`REVIEW` ditolak.

---

### 12. `numa block [id] --reason <teks>`
- **Deskripsi**: Menandai task `BLOCKED` dengan alasan eksplisit (mis. spesifikasi ambigu) lalu agent berhenti dan melapor ke user (`POST /api/agent/tasks/:id/block`).

---

### 13. `numa checkpoint`
- **Deskripsi**: Menampilkan checkpoint yang menunggu approval (`GET /api/agent/checkpoints`) dan menandai yang sedang memblokir agent. Approval hanya bisa dilakukan user lewat web (halaman Board).

---

### 14. `numa init [--update] [--target agents|claude|all]`
- **Deskripsi**: Memasang skill pack dan kontrak arsitektur ke workspace, menulis `.numa/workspace.json` dan `.numa/skills.version`.
- **Lokasi pasang**: `.agents/skills/<skill>/SKILL.md` (sumber utama, netral agent) dan salinan `.claude/skills/<skill>/SKILL.md` (default `--target all`). Blok Numa ditulis ke `AGENTS.md`; `CLAUDE.md` dibuat berisi `@AGENTS.md` bila belum ada. Isi milik user tidak ditimpa.
- **Skill (8)**: `numa-workflow`, `numa-incremental`, `numa-tdd`, `numa-api-design`, `numa-security`, `numa-production`, `numa-frontend`, `numa-architecture`.
- **Guard**: file `.numa/` dan `.agents|.claude/skills/numa-*` tidak dihitung sebagai perubahan task.
- **Versi skill pack**: bila versi terpasang sama dengan versi CLI, `init` dilewati. Gunakan `--update` (atau `--force`) untuk memasang ulang setelah CLI diperbarui. `numa status` memperingatkan bila versinya berbeda.

---

## 4. Pola Eksekusi AI Coding Agent (Loop Otonom)

AI Coding Agent mengeksekusi siklus 4 tahap secara berulang:

1. `numa next` -> Mengambil task aktif berikutnya.
2. `numa start` -> Mengunci task menjadi IN_PROGRESS.
3. `numa context` -> Membaca batasan file dan kriteria keberhasilan.
4. Tulis & uji kode secara lokal sesuai kriteria.
5. `numa done` -> Menandai task selesai dan mengecek checkpoint gate.
