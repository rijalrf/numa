# numa-cli

CLI agent loop untuk autonomous AI coding agent. Execute tasks via bounded context isolation. Login lewat browser — satu login bisa akses multiple projects.

## Installation

```bash
npm install -g numa-cli
```

Atau jalankan langsung tanpa instalasi:

```bash
npx numa-cli@latest switch <project-id>   # login lewat browser otomatis di pemakaian pertama
```

## Commands

### Login (otomatis, tanpa perintah `login`)
Tidak ada perintah `numa login` dan tidak ada token yang disalin. Di pemakaian pertama, perintah apa pun yang butuh sesi menampilkan alamat dan kode persetujuan, membuka browser, lalu menunggu Anda menekan **Setujui** di web. Token berlingkup semua project (90 hari) tersimpan otomatis di `~/.numa/config.json`.

```bash
numa --api-url https://numa.opendv.xyz switch <project-id>   # --api-url disimpan untuk perintah berikutnya
```

- Sesi tanpa TTY (mis. AI agent): CLI menunggu ~90 detik lalu keluar kode 2; setelah Anda menyetujui, jalankan ulang perintah yang sama.
- Token kedaluwarsa atau dicabut (HTTP 401) dihapus lokal; perintah berikutnya meminta login lagi. `numa logout` menghapus sesi.

Konfigurasi berlapis: env (`NUMA_API_URL`, `NUMA_PROJECT_ID`) > `.numa/workspace.json` > `~/.numa/config.json`.

### `switch [projectId]`
Beralih project dari token universal. Tanpa parameter tampilkan bantuan, dengan parameter set project aktif.

**Tampilkan bantuan:**
```bash
numa switch
```

**Switch ke project lain:**
```bash
numa switch <project-id>
```

### `whoami`
Tampilkan info project dari token saat ini.

**Contoh:**
```bash
numa whoami
```

### `next`
Ambil task berikutnya dari Kanban board. Menampilkan:
- Task order number
- Layer (DATABASE | BACKEND | FRONTEND | INTEGRATION)
- Title & description
- Acceptance criteria

**Output:**
```
Task #1 [DATABASE] TODO
ID    : abc-123-def
Judul : Create database schema for users table

-> Lanjut: numa start lalu numa context
```

### `start [id]`
Tandai task sebagai IN_PROGRESS dan catat baseline git (`.numa/state.json`). Gunakan setelah `next`.

**Contoh:**
```bash
numa start
# atau spesifik:
numa start abc-123-def
```

### `context [id]`
Cetak Markdown bounded context untuk task aktif. Berisi:
- File yang BOLEH dibuat (`files_to_create`)
- File yang BOLEH dimodifikasi (`files_to_modify`)
- File yang DILARANG (`forbidden`)

**PENTING**: WAJIB dibaca AI agent (Claude Code, Cursor, dll) sebelum implementasi.

**Contoh:**
```bash
numa context
```

### `done [id]`
Jalankan runtime scope guard lalu tandai task selesai. Mencetak info netral bila layer selesai (mode eksekusi di Master Prompt menentukan berhenti atau lanjut).

Guard menilai file yang berubah **sejak `numa start`**: file `forbidden` memblokir, file di luar lingkup hanya diperingatkan. `validation_commands` dijalankan dengan kebijakan keamanan (pipe, `;`, backtick, `$(...)`, redirect ditolak; program di luar allowlist butuh konfirmasi atau `--allow-unlisted`). `--force` melewati guard tetapi tercatat di server.

**Output jika layer selesai:**
```
Task abc-123 -> DONE

Layer FRONTEND selesai (tidak ada task tersisa di layer ini).
-> Ikuti mode eksekusi di Master Prompt: konfirmasi per layer = berhenti dan minta konfirmasi user; otomatis penuh = lanjut dengan: numa next
```

**Jika layer belum selesai:**
```
-> Lanjut: numa next
```

### `retry [id]`, `block [id] --reason <teks>`
- `retry`: kembalikan task BLOCKED/IN_PROGRESS ke TODO.
- `block`: tandai task BLOCKED dengan alasan lalu berhenti dan lapor ke user.

### `init [--update] [--target agents|claude|all]`
Pasang skill pack dan kontrak arsitektur ke workspace, tulis `.numa/workspace.json` dan `.numa/skills.version`. Gunakan `--update` setelah memperbarui CLI.

Struktur yang dibuat di workspace:

```
.agents/skills/<skill>/SKILL.md   sumber utama, netral terhadap agent
.claude/skills/<skill>/SKILL.md   salinan untuk Claude Code (target all atau claude)
.numa/                            workspace.json, skills.version, state lokal (state.json diabaikan git)
AGENTS.md                         blok Numa di antara penanda numa:begin dan numa:end
CLAUDE.md                         hanya berisi @AGENTS.md bila belum ada
```

Skill: `numa-workflow`, `numa-incremental`, `numa-tdd`, `numa-api-design`, `numa-security`, `numa-production`, `numa-frontend`, dan `numa-architecture` (dibangkitkan dari tech stack project). Isi AGENTS.md dan CLAUDE.md milik Anda tidak ditimpa; blok Numa hanya diperbarui dengan `--force`.

### `status`
Cek koneksi server API, validitas token, dan versi skill pack.

**Output:**
```
CLI    : 0.5.0
Server : http://localhost:6655 -> OK
Token  : tersimpan
Active : abc-123-def
```

### `logout`
Hapus token lokal dari config file `~/.numa/config.json`.

## Bounded Context Isolation

Setiap task punya **bounded context** yang ketat:
- **BOLEH**: Hanya sentuh file dalam `files_to_create` dan `files_to_modify`
- **DILARANG**: Sentuh file di luar list (akan ditolak oleh server validation)

Ini mencegah AI agent merusak file yang bukan tugasnya!

## Mode Eksekusi

Dipilih user di dialog Master Prompt (web), bukan lewat CLI:
- **Dengan konfirmasi per layer** (default): agent mengerjakan satu layer (BOOTSTRAP, DATABASE, BACKEND, FRONTEND, INTEGRATION) sampai selesai, berhenti, menampilkan ringkasan, dan meminta konfirmasi di percakapan sebelum lanjut.
- **Otomatis penuh**: agent menjalankan loop sampai semua task DONE tanpa konfirmasi, kecuali macet (`numa block`).

Aplikasi hasil generate diverifikasi lokal di `http://localhost:$PREVIEW_PORT` (default 9999, dapat diubah lewat env `PREVIEW_PORT` di server).

## Usage Pattern

Loop eksekusi standar:

```bash
# 1. Pilih project (login lewat browser otomatis di pemakaian pertama)
numa --api-url https://numa.opendv.xyz switch <project-id>

# 2. Loop setiap task
numa next      # Ambil task berikutnya
numa start     # Tandai IN_PROGRESS
numa context   # Baca bounded context (WAJIB!)
# ... kerjakan coding sesuai bounded context ...
numa done      # Tanda selesai

# Ulangi sampai CLI bilang "Tidak ada task tersisa"
```

## Configuration

File konfigurasi disimpan di: `~/.numa/config.json`

Environment variable override:
```bash
export NUMA_API_URL=http://your-server:6655
```

## Security

- Token PAT disimpan sebagai SHA-256 hash di database server
- Client hanya simpan token plaintext untuk auth header
- **Universal token**: satu token dapat akses multiple projects via scopes
- Scope validation enforced per-request via `X-Project-ID` header
- Auto-revoke jika dicabut via web UI (akan drop semua project scopes)

## License

MIT © Rijal RF
