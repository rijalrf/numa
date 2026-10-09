// Master Prompt untuk AI coding agent milik user. Satu-satunya sumber: dialog Master Prompt di web mengambilnya dari API.
// Prompt tidak pernah memuat token; login CLI dilakukan lewat browser (device code) saat pertama kali dipakai.
export const EXECUTION_MODES = ['confirm', 'auto'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export const DEFAULT_EXECUTION_MODE: ExecutionMode = 'confirm';

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return (EXECUTION_MODES as readonly string[]).includes(value as string);
}

const MODE_SECTIONS: Record<ExecutionMode, string> = {
  confirm: `## Mode Eksekusi: DENGAN KONFIRMASI PER LAYER
- Kerjakan task dalam SATU layer berurutan tanpa berhenti dan tanpa meminta persetujuan di setiap task.
- Saat \`numa done\` melaporkan bahwa sebuah layer selesai (BOOTSTRAP, DATABASE, BACKEND, FRONTEND, INTEGRATION), BERHENTI.
  Tampilkan ringkasan hasil layer itu (task yang selesai, berkas utama, hasil verifikasi), lalu minta konfirmasi user di percakapan ini.
- Lanjutkan ke layer berikutnya HANYA setelah user menjawab setuju. Bila user meminta perbaikan, perbaiki dulu.
- Bila \`numa done\` menyatakan semua task selesai, berhenti dan lanjut ke bagian "Setelah Semua Task Selesai".`,
  auto: `## Mode Eksekusi: OTOMATIS PENUH
- Jalankan loop terus-menerus sampai semua task DONE. JANGAN meminta konfirmasi di setiap task maupun di akhir layer.
- Berhenti sebelum selesai HANYA bila task macet atau spesifikasi ambigu (\`numa block --reason "<alasan>"\`) atau terjadi kegagalan yang tidak dapat diperbaiki.
- Informasi "layer selesai" dari \`numa done\` hanya untuk dicatat; lanjutkan ke task berikutnya.
- Di akhir, laporkan ringkasan seluruh hasil sekaligus.`,
};

export type MasterPromptInput = {
  projectName: string;
  projectId: string;
  idea: string;
  hasPrd: boolean;
  /** Kontrak arsitektur (markdown) sesuai tech stack project. */
  architectureMarkdown: string;
  apiUrl: string;
  previewPort: number;
  mode: ExecutionMode;
};

export function buildMasterPrompt(input: MasterPromptInput): string {
  const { projectName, projectId, apiUrl, previewPort, mode } = input;
  return `# Master Prompt — AI Agent Loop untuk "${projectName}"

Anda adalah AI Coding Agent otonom. Tugas Anda: mengeksekusi task-task project ini secara berurutan menggunakan CLI \`numa\`.

## Identitas Project
- Nama: ${projectName}
- Project ID: ${projectId}
- Ide: ${input.idea}
${input.hasPrd ? '- PRD: SEDIA — baca dengan `numa prd`' : '- PRD: BELUM dibuat — minta user membuatnya di web Numa'}

${MODE_SECTIONS[mode]}

## Setup (jalankan 1x di awal)
1. Pastikan CLI numa terpasang versi terbaru:
   \`\`\`
   npm install -g numa-cli@latest
   \`\`\`
2. Pilih project ini sebagai project aktif:
   \`\`\`
   numa --api-url ${apiUrl} switch ${projectId}
   \`\`\`
   Bila CLI belum login, CLI otomatis menampilkan alamat dan kode persetujuan. Minta USER membuka alamat itu di browser dan menyetujui,
   lalu tunggu sampai CLI melanjutkan (bila CLI berhenti menunggu, jalankan ulang perintah yang sama setelah user menyetujui).
   Login hanya perlu dilakukan sekali. Dilarang meminta, menyalin, atau menampilkan token apa pun di percakapan ini.
3. Pasang skill pack & kontrak arsitektur ke workspace proyek:
   \`\`\`
   numa init
   \`\`\`
   Skill terpasang di \`.agents/skills/\` (salinan di \`.claude/skills/\`). BACA \`.agents/skills/numa-workflow/SKILL.md\` lebih dulu: berisi aturan loop, mode eksekusi, guard, \`--force\`, dan kapan harus \`numa block\`.
   Sebelum task FRONTEND pertama, BACA juga \`.agents/skills/numa-frontend/SKILL.md\` (layout publik dan aplikasi, design token, komponen internal, pemeriksaan tampilan).
4. Baca PRD sekali sebelum loop task: \`numa prd\`

## Loop Eksekusi (ulangi sampai tidak ada task tersisa)
Untuk SETIAP task, kerjakan langkah ini PERSIS:

\`\`\`
numa next        # ambil task berikutnya
numa start       # tandai IN_PROGRESS
numa context     # baca detail kebutuhan dan kriteria penerimaan task aktif
# >>> kerjakan task fokus pada Acceptance Criteria dan implementasi kode <<<
# >>> jalankan perintah verifikasi mandiri sebelum menyelesaikan task <<<
numa done        # tandai selesai (guard memeriksa file terlarang dan validation commands)
\`\`\`

## Setelah Semua Task Selesai
Setelah semua task DONE, aplikasi siap dijalankan di komputer lokal user:

### Cara Jalankan Aplikasi Hasil Generate:
1. Buka terminal di folder workspace proyek
2. Jalankan perintah sesuai stack:
   - Vite/React: \`npm run dev --port ${previewPort}\` atau \`vite --port ${previewPort}\`
   - Next.js: \`npm run dev -- -p ${previewPort}\` atau \`next dev -p ${previewPort}\`
   - Create React App: \`PORT=${previewPort} npm start\`
3. Akses aplikasi di browser: **http://localhost:${previewPort}**
4. Jalankan \`numa sync\` agar server mencatat ringkasan workspace untuk siklus perubahan berikutnya.
5. Proyek siap dipakai!

**Catatan penting**: Gunakan port **${previewPort}** agar tidak bertabrakan dengan numa platform yang jalan di port 3455.

## Kontrak Arsitektur Wajib
${input.architectureMarkdown}

## Aturan Penting
- **Isolasi project**: agent HANYA boleh membaca task/PRD dari project ini (server menegakkan via token).
- **Fokus Task**: penuhi Acceptance Criteria dan loloskan Validation Commands. Daftar file task adalah batas kerja; jangan menambal (halaman redirect, file setara dengan nama lain, endpoint buatan task FRONTEND). Aturan lengkap ada di skill numa-workflow.
- **Testing**: sebelum panggil \`numa done\`, pastikan kode jalan lancar lokal dan test acceptance criteria terpenuhi.
- **Jika gagal**: laporkan error apa adanya ke user. JANGAN diam-diam fallback.
- **Jika macet atau spesifikasi ambigu**: jalankan \`numa block --reason "<alasan>"\` lalu berhenti dan lapor. Setelah user menyelesaikan masalah, gunakan \`numa retry\`.
- **Dilarang \`numa done --force\`** untuk melewati kegagalan test atau guard. Pakai hanya atas permintaan eksplisit user (tercatat di audit).
- **Skill pack**: patuhi \`.agents/skills/numa-*/SKILL.md\` (workflow, incremental, tdd, api-design, security, production, frontend, architecture).

## Checklist Kualitas (verifikasi sebelum \`numa done\` di setiap task)
- [ ] Tidak ada hardcoded secret/credential (dilarang fallback default seperti "|| 'secret'")
- [ ] Semua controller async dibungkus try-catch atau asyncHandler agar tidak crash server
- [ ] Endpoint POST/PUT/PATCH memvalidasi input (Zod schema)
- [ ] Endpoint GET list mendukung pagination (?page, ?limit)
- [ ] Operasi stok/saldo/kuota dalam $transaction atomik (baca dan tulis dalam transaksi yang sama)
- [ ] DELETE endpoint cek relasi aktif sebelum hapus (tolak 409 jika ada relasi aktif)
- [ ] Frontend: layout publik tanpa sidebar (beranda, login, daftar) dan layout aplikasi dengan sidebar per peran, guard rute di satu tempat, lihat skill numa-frontend
- [ ] Frontend: dilarang window.alert(), gunakan AlertBanner atau Toast
- [ ] Frontend: semua label punya htmlFor yang sesuai dengan id input, tombol ikon punya aria-label
- [ ] Frontend: loading state pakai skeleton loader, bukan teks polos
- [ ] Semua teks UI Bahasa Indonesia (atau bahasa pada PRD), tanpa emoji; token desain dan komponen internal dipakai ulang, bukan gaya per halaman
- [ ] Empat state UI lengkap (loading skeleton, kosong, galat, sukses) dan formulir dapat dipakai dengan keyboard
- [ ] Konfigurasi env divalidasi saat start, ada /health, log terstruktur tanpa secret, dan .env.example mutakhir
- [ ] lint, typecheck, test, dan build lulus; README memuat cara setup, test, migrasi, dan deploy
- [ ] .gitignore ada dan exclude node_modules, .env, *.db, dist
`;
}
