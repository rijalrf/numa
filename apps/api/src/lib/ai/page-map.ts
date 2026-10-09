// Peta halaman (ProductSpec.pages) sebagai kontrak bersama antar fase: render untuk prompt, pemilihan untuk `numa context`,
// dan deteksi endpoint yang dibutuhkan halaman tapi tidak ada di spec.
import type { ProductSpec, SpecPage } from './product-spec.js';
import { endpointKey } from './endpoint-path.js';

export type MissingPageEndpoint = { method: string; path: string; page: string };

/** Teks peta halaman untuk prompt generator task (semua fase menerima peta yang sama). */
export function renderPageMap(pages: SpecPage[]): string {
  if (pages.length === 0) return '';
  const lines = pages.map((p) => {
    const access = p.access === 'public' ? 'publik (layout publik, tanpa sidebar)' : `login (layout aplikasi, peran: ${p.roles.join(', ') || 'semua peran'})`;
    const home = p.homeFor.length > 0 ? `; halaman awal setelah login untuk: ${p.homeFor.join(', ')}` : '';
    const apis = p.endpoints.length > 0 ? `; endpoint: ${p.endpoints.map((e) => `${e.method} ${e.path}`).join(', ')}` : '';
    const reqs = p.requirementIds.length > 0 ? `; requirement: ${p.requirementIds.join(', ')}` : '';
    return `- ${p.path} "${p.title}" [${access}${home}]${apis}${reqs}`;
  });
  return lines.join('\n');
}

/** Aturan pemakaian peta halaman, ditempel bersama petanya di prompt. */
export const PAGE_MAP_RULES =
  'Path halaman, menu sidebar, tautan, dan redirect setelah login WAJIB mengikuti peta ini persis. File navigasi (atau padanannya) disusun dari peta ini; jangan membuat path lain dan jangan membuat halaman yang hanya berisi redirect.';

/** Endpoint yang dipanggil halaman tapi tidak terdaftar di spec.endpoints. */
export function findPageApiMissing(spec: ProductSpec | undefined | null): MissingPageEndpoint[] {
  if (!spec || spec.pages.length === 0) return [];
  const known = new Set(spec.endpoints.map((e) => endpointKey(e.method, e.path)));
  const missing = new Map<string, MissingPageEndpoint>();
  for (const page of spec.pages) {
    for (const ep of page.endpoints) {
      const key = endpointKey(ep.method, ep.path);
      if (!known.has(key) && !missing.has(key)) missing.set(key, { method: ep.method, path: ep.path, page: page.path });
    }
  }
  return [...missing.values()];
}

/** Teks endpoint tambahan untuk prompt fase BACKEND. */
export function renderMissingPageEndpoints(missing: MissingPageEndpoint[]): string {
  return missing.map((m) => `- ${m.method} ${m.path} (dibutuhkan halaman ${m.page})`).join('\n');
}

/** Halaman yang relevan dengan sebuah task: cocok lewat requirementIds atau path yang disebut di teks task. */
export function selectRelevantPages(pages: SpecPage[], requirementIds: string[], haystack: string): SpecPage[] {
  const ids = new Set(requirementIds);
  const text = haystack.toLowerCase();
  return pages.filter((p) => p.requirementIds.some((r) => ids.has(r)) || (p.path.length > 1 && text.includes(p.path.toLowerCase())));
}

/** Daftar ringkas semua path (untuk navigasi) pada `numa context`. */
export function listPagePaths(pages: SpecPage[]): string[] {
  return pages.map((p) => `${p.path} (${p.access === 'public' ? 'publik' : `login: ${p.roles.join(', ') || 'semua'}`})`);
}

/** Gabungkan halaman baru ke peta: path sama (tanpa membedakan huruf dan slash akhir) dilewati. */
export function mergePages(existing: SpecPage[], added: SpecPage[]): SpecPage[] {
  const norm = (p: string) => p.trim().toLowerCase().replace(/\/+$/, '') || '/';
  const seen = new Set(existing.map((p) => norm(p.path)));
  const result = [...existing];
  for (const page of added) {
    if (seen.has(norm(page.path))) continue;
    seen.add(norm(page.path));
    result.push(page);
  }
  return result;
}

/** Render arah desain untuk prompt dan `numa context`. */
export function renderDesignDirection(design: NonNullable<ProductSpec['design']>): string {
  const lines = [
    design.tone && `Nuansa: ${design.tone}`,
    (design.palette.primary || design.palette.neutral) &&
      `Palet: primary ${design.palette.primary || '-'}${design.palette.accent ? `, aksen ${design.palette.accent}` : ''}, netral ${design.palette.neutral || '-'}${design.palette.rationale ? ` (${design.palette.rationale})` : ''}`,
    (design.typography.heading || design.typography.body) && `Tipografi: judul ${design.typography.heading || '-'}, isi ${design.typography.body || '-'}`,
    `Kepadatan: ${design.density === 'compact' ? 'padat (tabel dan data banyak)' : 'lega'}`,
    `Sudut: ${design.radius}`,
    design.avoid.length > 0 && `Dihindari: ${design.avoid.join('; ')}`,
  ].filter((l): l is string => typeof l === 'string' && l.length > 0);
  return lines.join('\n');
}
