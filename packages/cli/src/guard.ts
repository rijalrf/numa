// Runtime scope guard (Fase 2 & Bab 38).
// Validasi eksekusi task secara lokal di mesin user (git diff vs forbidden + validation commands)
// sebelum numa done mengirim status ke API. Server tidak bisa akses filesystem laptop user,
// jadi guard ini wajib berjalan di CLI.
import { spawn } from 'node:child_process';
import { checkCommand } from './command-policy.js';
import { confirm } from './prompt.js';
import { changedSinceStart, type TaskState } from './task-state.js';
import { CLI_VERSION } from './version.js';

export type GuardSpec = {
  layer?: string;
  forbidden?: string[];
  files_readonly?: string[];
  files_to_create?: string[];
  files_to_modify?: string[];
  validation_commands?: string[];
  advisory_commands?: string[];
};

export type FailureType = 'FORBIDDEN_FILES' | 'TEST_FAILURE' | 'COMMAND_FAILURE' | 'RUNTIME_ERROR';

export type GuardCommandResult = { command: string; ok: boolean; skipped?: boolean };

/** Laporan guard yang dikirim ke server saat `done` untuk jejak audit. */
export type GuardReport = {
  baseline: string | null;
  changedFiles: string[];
  outOfScopeFiles: string[];
  commands: GuardCommandResult[];
  cliVersion: string;
};

export type GuardOptions = {
  state?: TaskState | null;
  /** Izinkan program di luar allowlist tanpa konfirmasi (non-interaktif). */
  allowUnlisted?: boolean;
};

export type FailureContext = {
  task_id: string;
  status: 'FAILED';
  failure_type: FailureType;
  command?: string;
  error: string;
  affected_files: string[];
  next_action: string;
};

export class GuardError extends Error {
  failureContext?: FailureContext;
  constructor(message: string, failureContext?: FailureContext) {
    super(message);
    this.name = 'GuardError';
    this.failureContext = failureContext;
  }
}

// === Glob matching minimal (tanpa dependency eksternal) ===
// Dukungan: `dir/**`, `dir/*`, `*.ext`, `?` single char, prefix `dir` (match isi folder).
function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchesGlob(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (globToRegExp(pattern).test(path)) return true;
  // `dir/**` juga mencakup file tepat di bawah `dir/` (tanpa subpath tambahan)
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    if (path.startsWith(prefix + '/')) return true;
  }
  return false;
}

// === Eksekusi validation commands ===
type ExecResult = { ok: boolean; output: string; results: GuardCommandResult[] };

function execShell(cmd: string, cwd: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn('sh', ['-c', cmd], { cwd, shell: false });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (out += d.toString()));
    p.on('error', (e) => reject(new GuardError(`Gagal menjalankan "${cmd}": ${e.message}`)));
    p.on('close', (code) => resolve({ code, output: out }));
  });
}

/** Putuskan apakah perintah boleh jalan. Melempar GuardError bila ditolak. */
async function authorizeCommand(cmd: string, allowUnlisted: boolean): Promise<void> {
  const verdict = checkCommand(cmd);
  if (verdict.kind === 'allowed') return;
  if (verdict.kind === 'rejected') {
    throw new GuardError(
      `Perintah ditolak oleh kebijakan keamanan: "${cmd}"\nAlasan: ${verdict.reason}.\n` +
        'Jalankan verifikasi tersebut secara manual lalu gunakan: numa done --force'
    );
  }
  const list = verdict.unlisted.join(', ');
  if (allowUnlisted) return;
  const ok = await confirm(`Perintah "${cmd}" memakai program di luar allowlist (${list}). Izinkan menjalankan?`);
  if (!ok) {
    throw new GuardError(
      `Perintah dengan program di luar allowlist (${list}) tidak dijalankan: "${cmd}"\n` +
        'Gunakan --allow-unlisted bila Anda memercayainya, atau verifikasi manual lalu numa done --force.'
    );
  }
}

export async function runValidationCommands(commands: string[], cwd: string, allowUnlisted = false): Promise<ExecResult> {
  const logs: string[] = [];
  const results: GuardCommandResult[] = [];
  for (const cmd of commands) {
    await authorizeCommand(cmd, allowUnlisted);
    const { code, output } = await execShell(cmd, cwd);
    logs.push(`$ ${cmd}\n${output}`.trim());
    results.push({ command: cmd, ok: code === 0 });
    if (code !== 0) return { ok: false, output: logs.join('\n\n'), results };
  }
  return { ok: true, output: logs.join('\n\n'), results };
}

// === Orchestrasi guard utama ===
/** File yang dikelola Numa sendiri (state lokal dan skill pack) tidak dinilai sebagai perubahan task. */
export function isInternalFile(file: string): boolean {
  if (file === '.numa' || file.startsWith('.numa/')) return true;
  return /^\.(agents|claude)\/skills\/numa-[^/]+\//.test(file);
}

export async function runGuard(spec: GuardSpec, cwd: string, taskId?: string, opts: GuardOptions = {}): Promise<GuardReport> {
  const forbidden = spec.forbidden ?? [];
  const allowed = [...(spec.files_to_create ?? []), ...(spec.files_to_modify ?? [])];

  const changed = changedSinceStart(cwd, opts.state ?? null).filter((f) => !isInternalFile(f));
  const report: GuardReport = {
    baseline: opts.state?.baselineSha ?? null,
    changedFiles: changed,
    outOfScopeFiles: [],
    commands: [],
    cliVersion: CLI_VERSION,
  };
  if (!opts.state) {
    console.log('Peringatan: baseline task tidak ditemukan (numa start belum dijalankan di workspace ini). Guard menilai seluruh worktree.');
  }

  const violations: Array<{ file: string; pattern: string }> = [];
  for (const file of changed) {
    for (const pattern of forbidden) {
      if (matchesGlob(pattern, file)) {
        violations.push({ file, pattern });
      }
    }
  }
  if (violations.length > 0) {
    const list = violations.map((v) => `- ${v.file}  (larangan: ${v.pattern})`).join('\n');
    const failure: FailureContext = {
      task_id: taskId ?? 'UNKNOWN',
      status: 'FAILED',
      failure_type: 'FORBIDDEN_FILES',
      error: `Task menyentuh file terlarang (forbidden):\n${list}`,
      affected_files: violations.map((v) => v.file),
      next_action: 'Revert perubahan pada file forbidden atau mintalah izin lingkup teknis baru.',
    };
    throw new GuardError(
      `Task menyentuh file terlarang (forbidden).\n${list}\n\nPerbaiki dengan revert perubahan tersebut, atau jalankan: numa done --force`,
      failure
    );
  }

  // File di luar allowlist hanya diperingatkan: daftar file dari AI bisa kurang lengkap.
  if (allowed.length > 0) {
    report.outOfScopeFiles = changed.filter((f) => !allowed.some((p) => matchesGlob(p, f)));
    if (report.outOfScopeFiles.length > 0) {
      const shown = report.outOfScopeFiles.slice(0, 20).map((f) => `- ${f}`).join('\n');
      const more = report.outOfScopeFiles.length > 20 ? `\n... dan ${report.outOfScopeFiles.length - 20} file lain` : '';
      console.log(`Peringatan (tidak memblokir): ${report.outOfScopeFiles.length} file berubah di luar lingkup task:\n${shown}${more}\n`);
    }
  }

  if (changed.length > 0 && !spec.validation_commands?.length) {
    console.log(`Catatan: ${changed.length} file berubah, tanpa validation_commands pada task ini.`);
  }

  const commands = spec.validation_commands ?? [];
  if (commands.length > 0) {
    console.log('Menjalankan validation_commands...\n');
    const { ok, output, results } = await runValidationCommands(commands, cwd, opts.allowUnlisted);
    report.commands.push(...results);
    console.log(output);
    if (!ok) {
      const failure: FailureContext = {
        task_id: taskId ?? 'UNKNOWN',
        status: 'FAILED',
        failure_type: 'TEST_FAILURE',
        command: commands.join(' && '),
        error: output.slice(-600),
        affected_files: changed,
        next_action: 'Perbaiki kegagalan kode sesuai output test/build di atas sebelum menandai selesai.',
      };
      throw new GuardError(
        'Validation commands GAGAL. Task belum layak ditandai selesai.\nPerbaiki kegagalan di atas, atau jalankan: numa done --force',
        failure
      );
    }
    console.log('\nSemua validation commands lolos.');
  }

  const advisory = spec.advisory_commands ?? [];
  if (advisory.length > 0) {
    console.log('\nMenjalankan pemeriksaan penasihat keamanan (advisory)...\n');
    try {
      const { ok, output, results } = await runValidationCommands(advisory, cwd, opts.allowUnlisted);
      report.commands.push(...results.map((r) => ({ ...r })));
      if (output) console.log(output);
      console.log(ok ? '\nPemeriksaan penasihat keamanan lolos.' : '\nPeringatan (tidak memblokir): Ditemukan anjuran audit keamanan di atas.');
    } catch (e) {
      // Advisory tidak boleh menggagalkan task; perintah yang ditolak kebijakan dilewati.
      if (!(e instanceof GuardError)) throw e;
      report.commands.push({ command: advisory.join(' && '), ok: false, skipped: true });
      console.log(`Peringatan (tidak memblokir): pemeriksaan advisory dilewati.\n${e.message}`);
    }
  }

  return report;
}

// === Git Conventional Commit Automation (Framework Vibe Coding Tahap 7) ===
export function generateConventionalCommit(task: {
  title: string;
  layer?: string;
  order?: number;
}): string {
  const rawLayer = (task.layer ?? 'chore').toLowerCase();
  let type = 'feat';
  if (rawLayer === 'bootstrap') type = 'chore';
  else if (rawLayer === 'integration') type = 'test';

  const cleanTitle = task.title.replace(/^(feat|fix|chore|refactor|test)(\(.*\))?:\s*/i, '').trim();
  const summary = cleanTitle.length > 55 ? cleanTitle.slice(0, 52) + '...' : cleanTitle;
  const orderText = task.order ? `Task #${task.order}` : 'numa task';
  return `${type}(${rawLayer}): ${summary}\n\nAutomated commit via numa done --commit (${orderText})`;
}

export function gitCommit(message: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const add = spawn('git', ['add', '-A'], { cwd, shell: false });
    let addErr = '';
    add.stderr.on('data', (d) => (addErr += d.toString()));
    add.on('close', (addCode) => {
      if (addCode !== 0) {
        reject(new GuardError(`git add gagal (exit ${addCode}): ${addErr.trim()}`));
        return;
      }
      const commit = spawn('git', ['commit', '-m', message], { cwd, shell: false });
      let commitOut = '';
      let commitErr = '';
      commit.stdout.on('data', (d) => (commitOut += d.toString()));
      commit.stderr.on('data', (d) => (commitErr += d.toString()));
      commit.on('close', (commitCode) => {
        if (commitCode !== 0) {
          reject(new GuardError(`git commit gagal (exit ${commitCode}): ${commitErr.trim()}`));
          return;
        }
        resolve(commitOut.trim());
      });
      commit.on('error', (e) => reject(new GuardError(`Gagal menjalankan git commit: ${e.message}`)));
    });
    add.on('error', (e) => reject(new GuardError(`Gagal menjalankan git add: ${e.message}`)));
  });
}