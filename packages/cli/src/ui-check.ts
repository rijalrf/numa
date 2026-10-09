// Pemeriksaan gaya UI bawaan `numa done` untuk task FRONTEND. Ditanam di CLI (bukan ditulis agent di repo user) agar hasilnya
// sama di semua project. Hanya file yang berubah pada task itu yang dipindai, dan hanya bila server mengirim konfigurasi
// `uiCheck` (task yang dibuat dengan tasks@6 ke atas pada stack Tailwind yang dikenali).
import fs from 'node:fs';
import path from 'node:path';
import { matchesGlob } from './guard.js';

export type UiCheckConfig = {
  extensions: string[];
  roots: string[];
  exempt: string[];
};

export type UiViolation = { file: string; line: number; match: string; rule: 'palet-bawaan' | 'warna-arbitrer' | 'hex-mentah' };

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILS = 'bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|accent|caret|placeholder';

/** Kelas warna palet bawaan Tailwind, mis. `bg-sky-500` atau `hover:text-slate-900/80`. */
const DEFAULT_PALETTE = new RegExp(`(?<![\\w-])(?:${COLOR_UTILS})-(?:${PALETTE})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![\\w-])`, 'g');
/** Nilai warna arbitrer, mis. `bg-[#0ea5e9]` atau `text-[rgb(1,2,3)]`. */
const ARBITRARY_COLOR = new RegExp(`(?<![\\w-])(?:${COLOR_UTILS})-\\[(?:#|rgb|hsl|oklch|color:)[^\\]]*\\]`, 'g');
/** Hex mentah (3, 4, 6, atau 8 digit) yang bukan bagian dari kata, entitas HTML, atau jangkar tautan. */
const RAW_HEX = /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;

const normalize = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** True bila file termasuk cakupan pemeriksaan: di bawah salah satu akar, berekstensi cocok, dan tidak dikecualikan. */
export function isUiCheckTarget(file: string, config: UiCheckConfig): boolean {
  const f = normalize(file);
  if (!config.extensions.some((ext) => f.endsWith(ext))) return false;
  if (!config.roots.some((root) => f === root || f.startsWith(`${root.replace(/\/$/, '')}/`))) return false;
  return !config.exempt.some((pattern) => matchesGlob(pattern, f));
}

/** Pindai isi file; kembalikan pelanggaran per baris. Baris tautan jangkar (`href="#..."`) dilewati untuk aturan hex. */
export function scanContent(file: string, content: string): UiViolation[] {
  const violations: UiViolation[] = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(DEFAULT_PALETTE)) violations.push({ file, line: idx + 1, match: m[0], rule: 'palet-bawaan' });
    const arbitrary: Array<[number, number]> = [];
    for (const m of line.matchAll(ARBITRARY_COLOR)) {
      arbitrary.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
      violations.push({ file, line: idx + 1, match: m[0], rule: 'warna-arbitrer' });
    }
    if (!/href\s*=/.test(line)) {
      for (const m of line.matchAll(RAW_HEX)) {
        const at = m.index ?? 0;
        // Hex di dalam nilai arbitrer sudah dilaporkan sebagai warna-arbitrer.
        if (arbitrary.some(([from, to]) => at >= from && at < to)) continue;
        violations.push({ file, line: idx + 1, match: m[0], rule: 'hex-mentah' });
      }
    }
  });
  return violations;
}

/** Periksa file yang berubah pada task. File yang tidak terbaca (mis. dihapus) dilewati. */
export function checkUiStyles(changedFiles: string[], cwd: string, config: UiCheckConfig): UiViolation[] {
  const violations: UiViolation[] = [];
  for (const file of changedFiles) {
    if (!isUiCheckTarget(file, config)) continue;
    let content: string;
    try {
      content = fs.readFileSync(path.join(cwd, file), 'utf-8');
    } catch {
      continue;
    }
    violations.push(...scanContent(normalize(file), content));
  }
  return violations;
}

const RULE_LABEL: Record<UiViolation['rule'], string> = {
  'palet-bawaan': 'kelas warna palet bawaan Tailwind',
  'warna-arbitrer': 'nilai warna arbitrer',
  'hex-mentah': 'warna hex mentah',
};

export function formatUiViolations(violations: UiViolation[], limit = 20): string {
  const shown = violations.slice(0, limit).map((v) => `- ${v.file}:${v.line}  ${v.match}  (${RULE_LABEL[v.rule]})`);
  const more = violations.length > limit ? `\n... dan ${violations.length - limit} pelanggaran lain` : '';
  return `${shown.join('\n')}${more}`;
}
