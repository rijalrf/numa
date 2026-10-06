// Kebijakan eksekusi validation_commands. Perintah berasal dari data task hasil AI, jadi dianggap tidak tepercaya:
// - Metakarakter shell berbahaya ditolak (pipe, ;, backtick, $(, redirect, background).
// - '&&' diperbolehkan; setiap segmen dicek terhadap allowlist program.
// - Program di luar allowlist hanya jalan dengan konfirmasi user (atau --allow-unlisted).
// - Program yang selalu ditolak: sudo, su, ssh, dsb.

export const ALLOWED_PROGRAMS = new Set([
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'node', 'tsc', 'tsx', 'vitest', 'jest', 'playwright', 'eslint', 'prettier',
  'prisma', 'pytest', 'python', 'python3', 'pip', 'go', 'php', 'composer', 'artisan', 'cargo', 'make', 'dotnet',
  'mvn', 'gradle', 'ruby', 'bundle', 'rspec', 'cd', 'test', 'ls', 'cat', 'echo', 'true',
]);

export const DENIED_PROGRAMS = new Set(['sudo', 'su', 'ssh', 'scp', 'nc', 'ncat', 'dd', 'mkfs', 'eval', 'exec']);

export type CommandVerdict =
  | { kind: 'allowed'; programs: string[] }
  | { kind: 'needs-confirmation'; programs: string[]; unlisted: string[] }
  | { kind: 'rejected'; reason: string };

type SplitResult = { ok: true; segments: string[] } | { ok: false; reason: string };

/** Pecah perintah pada '&&' di luar kutip sambil menolak metakarakter berbahaya. */
export function splitCommand(command: string): SplitResult {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];

    if (quote === "'") {
      if (c === "'") quote = null;
      current += c;
      continue;
    }
    if (c === '\\') {
      current += c + (next ?? '');
      i += 1;
      continue;
    }
    if (c === '`') return { ok: false, reason: 'substitusi perintah dengan backtick tidak diizinkan' };
    if (c === '$' && next === '(') return { ok: false, reason: 'substitusi $(...) tidak diizinkan' };
    if (c === '\n' || c === '\r') return { ok: false, reason: 'perintah multi-baris tidak diizinkan' };

    if (quote === '"') {
      if (c === '"') quote = null;
      current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    if (c === '&' && next === '&') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (c === '&') return { ok: false, reason: 'eksekusi latar belakang (&) tidak diizinkan' };
    if (c === '|') return { ok: false, reason: 'pipe atau || tidak diizinkan' };
    if (c === ';') return { ok: false, reason: 'pemisah perintah ; tidak diizinkan' };
    if (c === '>' || c === '<') return { ok: false, reason: 'redirect input/output tidak diizinkan' };
    current += c;
  }
  if (quote) return { ok: false, reason: 'tanda kutip tidak berpasangan' };
  segments.push(current);

  const cleaned = segments.map((s) => s.trim());
  if (cleaned.some((s) => s === '')) return { ok: false, reason: 'segmen perintah kosong' };
  return { ok: true, segments: cleaned };
}

/** Ambil nama program dari satu segmen (lewati assignment env seperti NODE_ENV=test). */
export function programOf(segment: string): string {
  const tokens = segment.split(/\s+/);
  for (const t of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue;
    const base = t.replace(/^\.\//, '');
    return base.split('/').pop() ?? base;
  }
  return '';
}

export function checkCommand(command: string): CommandVerdict {
  const trimmed = command.trim();
  if (!trimmed) return { kind: 'rejected', reason: 'perintah kosong' };

  const split = splitCommand(trimmed);
  if (!split.ok) return { kind: 'rejected', reason: split.reason };

  const programs = split.segments.map(programOf);
  const denied = programs.find((p) => DENIED_PROGRAMS.has(p));
  if (denied) return { kind: 'rejected', reason: `program "${denied}" selalu ditolak` };
  if (programs.some((p) => p === '')) return { kind: 'rejected', reason: 'program tidak dapat ditentukan' };

  // `cd` hanya boleh ke path relatif di dalam workspace
  for (const seg of split.segments) {
    if (programOf(seg) === 'cd') {
      const target = seg.replace(/^.*?\bcd\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (!target || target.startsWith('/') || target.startsWith('~') || target.split('/').includes('..')) {
        return { kind: 'rejected', reason: 'cd hanya boleh ke folder relatif di dalam workspace' };
      }
    }
  }

  const unlisted = [...new Set(programs.filter((p) => !ALLOWED_PROGRAMS.has(p)))];
  if (unlisted.length > 0) return { kind: 'needs-confirmation', programs, unlisted };
  return { kind: 'allowed', programs };
}
