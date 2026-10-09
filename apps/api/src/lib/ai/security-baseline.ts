// Kriteria keamanan baseline yang disuntikkan secara deterministik ke task (tanpa AI), per layer dan endpoint.
// Menggantikan penyuntikan oleh audit AI di jalur utama; audit AI kini berjalan di background hanya untuk temuan.
import type { TaskGen } from './tasks.js';
import type { SpecEndpoint } from './product-spec.js';

const PREFIX = 'Keamanan:';

const CRITERIA = {
  bootstrap: `${PREFIX} .gitignore mengecualikan .env dan berkas rahasia; .env.example hanya berisi nama variabel dengan nilai contoh, bukan kredensial nyata.`,
  databasePassword: `${PREFIX} kolom password hanya menyimpan hash, bukan teks asli.`,
  secrets: `${PREFIX} secret dan kredensial dibaca dari environment tanpa nilai default; response tidak memuat password hash atau token internal.`,
  validation: `${PREFIX} request body endpoint mutasi divalidasi dengan skema sebelum diproses; input tidak valid dibalas HTTP 400 berformat JSON terstruktur.`,
  relationIntegrity: `${PREFIX} endpoint DELETE menolak penghapusan record yang masih berelasi aktif dengan HTTP 409.`,
  auth: `${PREFIX} endpoint terproteksi memverifikasi autentikasi sebelum memproses dan hanya membaca atau mengubah data milik pengguna yang berhak (cegah IDOR).`,
  publicGet: `${PREFIX} endpoint publik hanya mengembalikan field yang dibutuhkan tampilan publik; email, nomor telepon, password hash, dan token tidak boleh dikembalikan.`,
  rateLimit: `${PREFIX} endpoint login/registrasi dibatasi rate limiting terhadap percobaan berulang.`,
  frontend: `${PREFIX} token dan secret tidak ditulis di kode sumber maupun log; input pengguna dirender sebagai teks, bukan HTML mentah.`,
} as const;

const SYSTEM_PATH = /\/(health|ready|ping)\b/i;
const PUBLIC_PATH = /\/(login|register|signin|signup|sign-in|sign-up|health|ready|ping|public)\b/i;
const CREDENTIAL_PATH = /\/(login|register|signin|signup|sign-in|sign-up|auth)\b/i;
const MUTATION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const norm = (v: string) => v.trim().toLowerCase();
const endpointKey = (method: string, path: string) => `${method.toUpperCase()} ${norm(path)}`;

function isProtected(method: string, path: string, authByEndpoint: Map<string, boolean>): boolean {
  const declared = authByEndpoint.get(endpointKey(method, path));
  if (declared !== undefined) return declared;
  return !PUBLIC_PATH.test(path);
}

function baselineFor(task: TaskGen, authByEndpoint: Map<string, boolean>): string[] {
  const out: string[] = [];
  switch (task.layer) {
    case 'BOOTSTRAP':
      out.push(CRITERIA.bootstrap);
      break;
    case 'DATABASE':
      if (/password|kata sandi/i.test(`${task.title} ${task.description ?? ''} ${task.acceptanceCriteria.join(' ')}`)) {
        out.push(CRITERIA.databasePassword);
      }
      break;
    case 'BACKEND': {
      const contracts = task.apiContracts ?? [];
      out.push(CRITERIA.secrets);
      if (contracts.some((c) => ['POST', 'PUT', 'PATCH'].includes(c.method))) out.push(CRITERIA.validation);
      if (contracts.some((c) => c.method === 'DELETE')) out.push(CRITERIA.relationIntegrity);
      if (contracts.some((c) => isProtected(c.method, c.path, authByEndpoint))) out.push(CRITERIA.auth);
      if (contracts.some((c) => c.method === 'GET' && !SYSTEM_PATH.test(c.path) && !isProtected(c.method, c.path, authByEndpoint))) out.push(CRITERIA.publicGet);
      if (contracts.some((c) => c.method === 'POST' && CREDENTIAL_PATH.test(c.path))) out.push(CRITERIA.rateLimit);
      break;
    }
    case 'FRONTEND':
      if ((task.consumesApis ?? []).some((c) => MUTATION.has(c.method)) || /login|form|input/i.test(task.title)) {
        out.push(CRITERIA.frontend);
      }
      break;
    default:
      break;
  }
  return out;
}

/**
 * Tambahkan kriteria keamanan baseline ke task sesuai layer dan endpoint-nya. Kriteria yang sudah ada tidak digandakan.
 * `endpoints` (spec PRD) menentukan apakah endpoint butuh autentikasi; tanpa itu, semua endpoint dianggap terproteksi
 * kecuali jalur publik umum (login, register, health).
 */
export function applySecurityBaseline(tasks: TaskGen[], endpoints: SpecEndpoint[] = []): { tasks: TaskGen[]; touched: number } {
  const authByEndpoint = new Map<string, boolean>();
  for (const ep of endpoints) {
    if (typeof ep.authRequired === 'boolean') authByEndpoint.set(endpointKey(ep.method, ep.path), ep.authRequired);
  }

  let touched = 0;
  const result = tasks.map((task) => {
    const existing = new Set(task.acceptanceCriteria.map(norm));
    const fresh = baselineFor(task, authByEndpoint).filter((c) => !existing.has(norm(c)));
    if (fresh.length === 0) return task;
    touched++;
    return { ...task, acceptanceCriteria: [...task.acceptanceCriteria, ...fresh] };
  });
  return { tasks: result, touched };
}
