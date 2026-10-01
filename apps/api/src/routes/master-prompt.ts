// Master prompt untuk user copy-paste ke AI coding agent.
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { resolveArchitectureContract, renderArchitectureContract } from '../lib/ai/architecture-contract.js';

export const masterPromptRouter = Router();

masterPromptRouter.get('/api/projects/:id/master-prompt', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { prd: true, stacks: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const stackContract = resolveStackContract(project.stacks || []);
  const archContract = resolveArchitectureContract(stackContract);
  const archMd = renderArchitectureContract(archContract);

  const host = req.get('host');
  const protocol = req.protocol || (req.secure ? 'https' : 'http');
  const serverUrl = host
    ? `${protocol}://${host}`
    : (process.env.BETTER_AUTH_URL ?? 'https://numa.opendv.xyz');

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
2. Login dengan token di bawah ini sekaligus arahkan ke server (tersimpan di ~/.numa/config.json):
   \`\`\`
   numa login {{TOKEN}} --api-url ${serverUrl}
   \`\`\`
3. Pasang skill pack & kontrak arsitektur ke workspace proyek:
   \`\`\`
   numa init
   \`\`\`

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
   - Vite/React: \`npm run dev --port 9999\` atau \`vite --port 9999\`
   - Next.js: \`npm run dev -- -p 9999\` atau \`next dev -p 9999\`
   - Create React App: \`PORT=9999 npm start\`
3. Akses aplikasi di browser: **http://localhost:9999**
4. Jalankan \`numa sync\` agar server mencatat ringkasan workspace untuk siklus perubahan berikutnya.
5. Proyek siap dipakai!

**Catatan penting**: Gunakan port **9999** agar tidak bertabrakan dengan numa platform yang jalan di port 3455.

## Kontrak Arsitektur Wajib
${archMd}

## Aturan Penting
- **Isolasi project**: agent HANYA boleh membaca task/PRD dari project ini (server menegakkan via token).
- **Fokus Task**: penuhi Acceptance Criteria dan loloskan Validation Commands. Struktur file adalah panduan arsitektur.
- **Checkpoint gate**: jika setelah \`done\` ada pesan checkpoint, BERHENTI dan minta approval user sebelum lanjut.
- **Layer transition**: jika layer (DATABASE/BACKEND/FRONTEND) sudah selesai, minta approval user.
- **Testing**: sebelum panggil \`numa done\`, pastikan kode jalan lancar lokal dan test acceptance criteria terpenuhi.
- **Jika gagal**: laporkan error apa adanya ke user. JANGAN diam-diam fallback.

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
- [ ] .gitignore ada dan exclude node_modules, .env, *.db, dist

## Token Anda
Tempel token di placeholder di bawah SEBELUM menyalin prompt ini.

{{TOKEN}}
`;

  res.json({ projectName: project.name, prompt: md });
});
