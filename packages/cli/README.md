# numa

CLI agent loop untuk autonomous AI coding agent. Execute tasks via bounded context isolation. Universal PAT support — satu token bisa akses multiple projects.

## Installation

```bash
npx numa@latest login <token>
```

No manual install needed — runs directly via npx!

## Commands

### `login <token>`
Login dengan Personal Access Token (PAT) yang dibuat di web UI Settings.

**Contoh:**
```bash
npx numa login numa_abc123def456...
```

Token universal ini bisa diakses ke beberapa project berbeda — cukup switch project sesuai kebutuhan.

### `switch [projectId]`
Beralih project dari token universal. Tanpa parameter tampilkan bantuan, dengan parameter set project aktif.

**Tampilkan bantuan:**
```bash
npx numa switch
```

**Switch ke project lain:**
```bash
npx numa switch <project-id>
```

### `whoami`
Tampilkan info project dari token saat ini.

**Contoh:**
```bash
npx numa whoami
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
Tandai task sebagai IN_PROGRESS. Gunakan setelah `next`.

**Contoh:**
```bash
npx numa start
# atau spesifik:
npx numa start abc-123-def
```

### `context [id]`
Cetak Markdown bounded context untuk task aktif. Berisi:
- File yang BOLEH dibuat (`files_to_create`)
- File yang BOLEH dimodifikasi (`files_to_modify`)
- File yang DILARANG (`forbidden`)

**PENTING**: WAJIB dibaca AI agent (Claude Code, Cursor, dll) sebelum implementasi.

**Contoh:**
```bash
npx numa context
```

### `done [id]`
Tandai task selesai dan perbarui status di server. Trigger checkpoint gate jika layer selesai.

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

### `status`
Cek koneksi server API dan status token lokal.

**Output:**
```
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

Plus: **APPS_READY_FOR_USE** checkpoint setelah FRONTEND selesai untuk verifikasi aplikasi jalan lokal di `http://localhost:9999`.

## Usage Pattern

Loop eksekusi standar:

```bash
# 1. Login (sekali saja)
npx numa login numa_your_token_here

# 2. Loop setiap task
npx numa next      # Ambil task berikutnya
npx numa start     # Tandai IN_PROGRESS
npx numa context   # Baca bounded context (WAJIB!)
# ... kerjakan coding sesuai bounded context ...
npx numa done      # Tanda selesai

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
