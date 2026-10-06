# numa-cli

CLI agent loop untuk autonomous AI coding agent. Execute tasks via bounded context isolation. Universal PAT support — satu token bisa akses multiple projects.

## Installation

```bash
npm install -g numa-cli
```

Atau jalankan langsung tanpa instalasi:

```bash
npx numa-cli@latest login
```

## Commands

### `login [token]`
Login dengan Personal Access Token (PAT) yang dibuat di halaman profil web. Token berlaku 90 hari secara default.

**Cara yang dianjurkan** (token tidak masuk riwayat shell):
```bash
numa login --api-url https://numa.mrijal.my.id   # token diminta lewat prompt tersembunyi
# atau non-interaktif (CI):
NUMA_TOKEN=... numa login --api-url https://numa.mrijal.my.id
```

Memberikan token sebagai argumen (`numa login <token>`) masih berjalan tetapi tampil peringatan karena terekam di riwayat shell.

Konfigurasi berlapis: env (`NUMA_TOKEN`, `NUMA_API_URL`, `NUMA_PROJECT_ID`) > `.numa/workspace.json` > `~/.numa/config.json`.

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
Jalankan runtime scope guard lalu tandai task selesai. Trigger checkpoint gate jika layer selesai.

Guard menilai file yang berubah **sejak `numa start`**: file `forbidden` memblokir, file di luar lingkup hanya diperingatkan. `validation_commands` dijalankan dengan kebijakan keamanan (pipe, `;`, backtick, `$(...)`, redirect ditolak; program di luar allowlist butuh konfirmasi atau `--allow-unlisted`). `--force` melewati guard tetapi tercatat di server.

**Output jika layer selesai:**
```
Task abc-123 -> DONE

!!! CHECKPOINT PENDING !!!
Layer FRONTEND selesai. Berhenti dan minta approval user sebelum lanjut ke layer berikutnya.
```

**Jika tidak ada checkpoint:**
```
-> Lanjut: numa next
```

### `retry [id]`, `block [id] --reason <teks>`, `checkpoint`
- `retry`: kembalikan task BLOCKED/IN_PROGRESS ke TODO.
- `block`: tandai task BLOCKED dengan alasan lalu berhenti dan lapor ke user.
- `checkpoint`: tampilkan checkpoint yang menunggu approval user (approval hanya lewat web).

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

## Checkpoint Gates

Sistem auto-trigger checkpoint saat layer selesai:
- DATABASE -> BACKEND -> FRONTEND -> INTEGRATION
- Setiap checkpoint butuh **user approval** via web UI sebelum lanjut

Plus: **APPS_READY_FOR_USE** checkpoint setelah FRONTEND selesai untuk verifikasi aplikasi jalan lokal di `http://localhost:$PREVIEW_PORT` (default 9999, dapat diubah lewat env `PREVIEW_PORT` di server).

## Usage Pattern

Loop eksekusi standar:

```bash
# 1. Login (sekali saja)
numa login numa_your_token_here

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
