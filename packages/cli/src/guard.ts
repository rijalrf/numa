// Runtime scope guard (Fase 2 & Bab 38).
// Validasi eksekusi task secara lokal di mesin user (git diff vs forbidden + validation commands)
// sebelum numa done mengirim status ke API. Server tidak bisa akses filesystem laptop user,
// jadi guard ini wajib berjalan di CLI.
import { spawn } from 'node:child_process';

export type GuardSpec = {
  layer?: string;
  forbidden?: string[];
  files_readonly?: string[];
  files_to_create?: string[];
  validation_commands?: string[];
  advisory_commands?: string[];
};

export type FailureType = 'FORBIDDEN_FILES' | 'TEST_FAILURE' | 'COMMAND_FAILURE' | 'RUNTIME_ERROR';

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

// === Utils git ===
export function gitStatusPorcelain(cwd: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['status', '--porcelain'], { cwd, shell: false });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new GuardError(`git status gagal (exit ${code}): ${err.trim()}`));
        return;
      }
      resolve(out.split('\n').map(parsePorcelainLine).filter((x): x is string => x !== null));
    });
    p.on('error', (e) => reject(new GuardError(`Tidak dapat menjalankan git: ${e.message}`)));
  });
}

function parsePorcelainLine(line: string): string | null {
  if (!line) return null;
  // Format: XY <path>. Rename: "R  old -> new" -> ambil target.
  const path = line.slice(3);
  const arrow = path.indexOf(' -> ');
  const target = arrow >= 0 ? path.slice(arrow + 4) : path;
  // Strip quoting core.quotepath (non-ASCII)
  if (target.startsWith('"') && target.endsWith('"') && target.length >= 2) {
    return target.slice(1, -1);
  }
  return target;
}

// === Eksekusi validation commands ===
export function runValidationCommands(commands: string[], cwd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve, reject) => {
    if (commands.length === 0) {
      resolve({ ok: true, output: '' });
      return;
    }
    const run = (i: number, logs: string[]): void => {
      const cmd = commands[i];
      const p = spawn('sh', ['-c', cmd], { cwd, shell: false });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d.toString()));
      p.stderr.on('data', (d) => (err += d.toString()));
      p.on('error', (e) => {
        reject(new GuardError(`Gagal menjalankan "${cmd}": ${e.message}`));
      });
      p.on('close', (code) => {
        logs.push(`$ ${cmd}\n${out}${err}`.trim());
        if (code !== 0) {
          resolve({ ok: false, output: logs.join('\n\n') });
          return;
        }
        if (i + 1 < commands.length) run(i + 1, logs);
        else resolve({ ok: true, output: logs.join('\n\n') });
      });
    };
    run(0, []);
  });
}

// === Orchestrasi guard utama ===
export async function runGuard(spec: GuardSpec, cwd: string, taskId?: string): Promise<void> {
  const forbidden = spec.forbidden ?? [];

  const changed = await gitStatusPorcelain(cwd);
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

  if (changed.length > 0 && !spec.validation_commands?.length) {
    console.log(`Catatan: ${changed.length} file berubah, tanpa validation_commands pada task ini.`);
  }

  const commands = spec.validation_commands ?? [];
  if (commands.length > 0) {
    console.log('Menjalankan validation_commands...\n');
    const { ok, output } = await runValidationCommands(commands, cwd);
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
    const { ok, output } = await runValidationCommands(advisory, cwd);
    if (output) console.log(output);
    if (!ok) {
      console.log('\nPeringatan (tidak memblokir): Ditemukan anjuran audit keamanan di atas.');
    } else {
      console.log('\nPemeriksaan penasihat keamanan lolos.');
    }
  }
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