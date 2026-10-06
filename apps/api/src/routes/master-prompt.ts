// Master prompt untuk user copy-paste ke AI coding agent.
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getPublicApiUrl, PREVIEW_PORT } from '../lib/config.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { resolveArchitectureContract, renderArchitectureContract } from '../lib/ai/architecture-contract.js';

export const masterPromptRouter = Router();

masterPromptRouter.get('/api/projects/:id/master-prompt', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { prd: true, stacks: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const stackContract = resolveStackContract(project.stacks || []);
  const archContract = resolveArchitectureContract(stackContract);
  const archMd = renderArchitectureContract(archContract);

  const serverUrl = getPublicApiUrl();

  const md = `# Master Prompt — AI Agent Loop untuk "${project.name}"

Anda adalah AI Coding Agent otonom. Tugas Anda: mengeksekusi task-task project ini secara berurutan menggunakan CLI \`numa\`.

## Identitas Project
- Nama: ${project.name}
- Ide: ${project.idea}
${project.prd ? `- PRD: SEDIA — fetch via \`numa prd\` atau download manual` : `- PRD: BELUM dibuat — minta user membuatnya lewat tool PRD Generator`}

## Setup (jalankan 1x di awal)
1. Pastikan CLI numa terpasang versi terbaru:
   \`\`\`
   npm install -g numa-cli@latest
   \`\`\`
2. Cek sesi login dengan \`numa whoami\`. Login dilakukan USER sendiri di terminal (token tidak pernah ditulis di prompt ini).
   Jika belum login, hentikan dan minta user menjalankan di terminal miliknya:
   \`\`\`
   numa login --api-url ${serverUrl}
   \`\`\`
   Dilarang meminta, menyalin, atau menampilkan token PAT di percakapan ini.
3. Pasang skill pack & kontrak arsitektur ke workspace proyek:
   \`\`\`
   numa init
   \`\`\`
   Skill terpasang di \`.agents/skills/\` (salinan di \`.claude/skills/\`). BACA \`.agents/skills/numa-workflow/SKILL.md\` lebih dulu: berisi aturan loop, guard, \`--force\`, checkpoint, dan kapan harus \`numa block\`.

## Fetch PRD (lakukan sekali, sebelum loop task)
Pilih SALAH SATU:
- **Via CLI** (direkomendasikan):
  \`\`\`
  numa prd
  \`\`\`
- **Manual**: download PRD.md dari web UI → save ke disk → paste isi PRD sebagai konteks

## Loop Eksekusi (ulangi sampai tidak ada task tersisa)
Untuk SETIAP task, kerjakan langkah ini PERSIS:

\`\`\`
numa next        # ambil task berikutnya
numa start       # tandai IN_PROGRESS
numa context     # baca detail kebutuhan dan kriteria penerimaan task aktif
# >>> kerjakan task fokus pada Acceptance Criteria dan implementasi kode <<<
# >>> jalankan perintah verifikasi mandiri sebelum menyelesaikan task <<<
numa done        # tandai selesai
\`\`\`

## Setelah Semua Task Selesai
Setelah semua task DONE, aplikasi siap dijalankan di komputer lokal user:

### Cara Jalankan Aplikasi Hasil Generate:
1. Buka terminal di folder workspace proyek
2. Jalankan perintah sesuai stack:
   - Vite/React: \`npm run dev --port ${PREVIEW_PORT}\` atau \`vite --port ${PREVIEW_PORT}\`
   - Next.js: \`npm run dev -- -p ${PREVIEW_PORT}\` atau \`next dev -p ${PREVIEW_PORT}\`
   - Create React App: \`PORT=${PREVIEW_PORT} npm start\`
3. Akses aplikasi di browser: **http://localhost:${PREVIEW_PORT}**
4. Jalankan \`numa sync\` agar server mencatat ringkasan workspace untuk siklus perubahan berikutnya.
5. Proyek siap dipakai!

**Catatan penting**: Gunakan port **${PREVIEW_PORT}** agar tidak bertabrakan dengan numa platform yang jalan di port 3455.

## Kontrak Arsitektur Wajib
${archMd}

## Aturan Penting
- **Isolasi project**: agent HANYA boleh membaca task/PRD dari project ini (server menegakkan via token).
- **Fokus Task**: penuhi Acceptance Criteria dan loloskan Validation Commands. Struktur file adalah panduan arsitektur.
- **Checkpoint gate**: jika setelah \`done\` ada pesan checkpoint, BERHENTI dan minta approval user sebelum lanjut.
- **Layer transition**: jika layer (DATABASE/BACKEND/FRONTEND) sudah selesai, minta approval user.
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
- [ ] Frontend: app shell default sidebar menu (nav kiri + konten utama), lihat skill numa-frontend
- [ ] Frontend: dilarang window.alert(), gunakan AlertBanner atau Toast
- [ ] Frontend: semua label punya htmlFor yang sesuai dengan id input, tombol ikon punya aria-label
- [ ] Frontend: loading state pakai skeleton loader, bukan teks polos
- [ ] Semua teks UI Bahasa Indonesia (atau bahasa pada PRD), tanpa emoji; token desain dan komponen internal dipakai ulang, bukan gaya per halaman
- [ ] Empat state UI lengkap (loading skeleton, kosong, galat, sukses) dan formulir dapat dipakai dengan keyboard
- [ ] Konfigurasi env divalidasi saat start, ada /health, log terstruktur tanpa secret, dan .env.example mutakhir
- [ ] lint, typecheck, test, dan build lulus; README memuat cara setup, test, migrasi, dan deploy
- [ ] .gitignore ada dan exclude node_modules, .env, *.db, dist

`;

  res.json({ projectName: project.name, prompt: md });
});
