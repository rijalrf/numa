// Kontrak UI shell dan file bersama per framework frontend. Dikirim ke semua fase pembuatan task (kontrak bersama),
// ke `numa context` task FRONTEND, dan dipakai quality gate (kepemilikan file, task FRONTEND yang membuat endpoint)
// serta pemeriksaan gaya di `numa done` (konfigurasi `uiCheck`).
import type { StackContract } from './stack-contract.js';

export type UiShellKey = 'nextjs' | 'react-spa' | 'vue-spa' | 'laravel-blade' | 'generic';

/** Pemilik file bersama: task yang boleh membuatnya. Task lain hanya memodifikasi atau membacanya. */
export type SharedFileOwner = 'BOOTSTRAP' | 'FONDASI_UI' | 'BACKEND';

export type SharedFile = {
  path: string;
  purpose: string;
  owner: SharedFileOwner;
};

/** Konfigurasi pemeriksaan gaya di CLI (`numa done`). Bentuknya dibaca apa adanya oleh packages/cli/src/ui-check.ts. */
export type UiCheckConfig = {
  /** Ekstensi file yang dipindai (termasuk titik, mis. ".tsx" atau ".blade.php"). */
  extensions: string[];
  /** Folder akar yang dipindai (relatif terhadap root repo). */
  roots: string[];
  /** Pola glob yang dikecualikan: pustaka komponen dan file token. */
  exempt: string[];
};

export interface UiShellContract {
  key: UiShellKey;
  title: string;
  publicLayout: string;
  appLayout: string;
  routeGuard: string;
  navigation: string;
  sharedFiles: SharedFile[];
  /** Pola glob file yang mendefinisikan endpoint API; task FRONTEND dilarang membuatnya. Kosong = tidak diperiksa. */
  endpointPatterns: string[];
  /** Konfigurasi pemeriksaan gaya bila styling Tailwind; null bila stack tidak didukung. */
  uiCheck: UiCheckConfig | null;
}

const UI_COMPONENTS_PURPOSE =
  'pustaka komponen internal: Button, Input, Select, Textarea, Modal, Card, Badge, Table, Skeleton, EmptyState, AlertBanner, Toast';

export const UI_SHELL_CONTRACTS: Record<Exclude<UiShellKey, 'generic'>, UiShellContract> & { generic: UiShellContract } = {
  nextjs: {
    key: 'nextjs',
    title: 'Next.js App Router',
    publicLayout: 'Route group (public): tanpa sidebar. Beranda publik, login, daftar, lupa password, dan halaman galat.',
    appLayout: 'Route group (app): sidebar dengan menu sesuai peran, nama dan peran user, dan tombol Keluar. Semua halaman setelah login.',
    routeGuard: 'src/middleware.ts: satu-satunya tempat pengecekan login dan peran; halaman tidak mengecek sendiri.',
    navigation: 'src/lib/navigation.ts: konstanta path halaman, menu per peran, dan halaman awal per peran.',
    sharedFiles: [
      { path: 'src/app/layout.tsx', purpose: 'html/body dan Providers saja, tanpa sidebar', owner: 'BOOTSTRAP' },
      { path: 'src/app/providers.tsx', purpose: 'satu-satunya file providers (session, query)', owner: 'FONDASI_UI' },
      { path: 'src/app/(public)/layout.tsx', purpose: 'layout publik tanpa sidebar', owner: 'FONDASI_UI' },
      { path: 'src/app/(app)/layout.tsx', purpose: 'layout aplikasi dengan sidebar', owner: 'FONDASI_UI' },
      { path: 'src/middleware.ts', purpose: 'guard rute per peran', owner: 'FONDASI_UI' },
      { path: 'src/lib/navigation.ts', purpose: 'path halaman, menu per peran, halaman awal per peran', owner: 'FONDASI_UI' },
      { path: 'src/components/layout/AppSidebar.tsx', purpose: 'sidebar; membaca menu dari navigation.ts', owner: 'FONDASI_UI' },
      { path: 'src/lib/api-client.ts', purpose: 'satu-satunya pembungkus fetch', owner: 'FONDASI_UI' },
      { path: 'src/components/ui/*', purpose: UI_COMPONENTS_PURPOSE, owner: 'FONDASI_UI' },
      { path: 'src/lib/validations/<domain>.schema.ts', purpose: 'satu file skema validasi per domain', owner: 'BACKEND' },
    ],
    endpointPatterns: ['src/app/api/**', 'app/api/**'],
    uiCheck: {
      extensions: ['.tsx', '.jsx'],
      roots: ['src/app', 'src/components', 'app', 'components'],
      exempt: ['src/components/ui/**', 'components/ui/**', 'tailwind.config.*', '**/*.css'],
    },
  },
  'react-spa': {
    key: 'react-spa',
    title: 'React SPA (Vite)',
    publicLayout: 'PublicLayout: tanpa sidebar. Beranda publik, login, daftar, lupa password, dan halaman galat.',
    appLayout: 'AppLayout: sidebar dengan menu sesuai peran, nama dan peran user, dan tombol Keluar. Semua halaman setelah login.',
    routeGuard: 'RequireAuth (apps/web/src/routes/RequireAuth.tsx) membungkus rute aplikasi; halaman tidak mengecek sendiri.',
    navigation: 'apps/web/src/lib/navigation.ts: konstanta path halaman, menu per peran, dan halaman awal per peran.',
    sharedFiles: [
      { path: 'apps/web/src/main.tsx', purpose: 'titik masuk aplikasi', owner: 'BOOTSTRAP' },
      { path: 'apps/web/src/app/providers.tsx', purpose: 'satu-satunya file providers (session, query)', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/layouts/PublicLayout.tsx', purpose: 'layout publik tanpa sidebar', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/layouts/AppLayout.tsx', purpose: 'layout aplikasi dengan sidebar', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/routes/RequireAuth.tsx', purpose: 'guard rute per peran', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/router.tsx', purpose: 'definisi rute; memakai path dari navigation.ts', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/lib/navigation.ts', purpose: 'path halaman, menu per peran, halaman awal per peran', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/components/layout/AppSidebar.tsx', purpose: 'sidebar; membaca menu dari navigation.ts', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/lib/api-client.ts', purpose: 'satu-satunya pembungkus fetch', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/components/ui/*', purpose: UI_COMPONENTS_PURPOSE, owner: 'FONDASI_UI' },
    ],
    endpointPatterns: ['apps/api/**'],
    uiCheck: {
      extensions: ['.tsx', '.jsx'],
      roots: ['apps/web/src'],
      exempt: ['apps/web/src/components/ui/**', 'apps/web/tailwind.config.*', '**/*.css'],
    },
  },
  'vue-spa': {
    key: 'vue-spa',
    title: 'Vue SPA (Vite)',
    publicLayout: 'PublicLayout.vue: tanpa sidebar. Beranda publik, login, daftar, lupa password, dan halaman galat.',
    appLayout: 'AppLayout.vue: sidebar dengan menu sesuai peran, nama dan peran user, dan tombol Keluar. Semua halaman setelah login.',
    routeGuard: 'meta.requiresAuth dan meta.roles pada rute dengan satu router.beforeEach; halaman tidak mengecek sendiri.',
    navigation: 'apps/web/src/lib/navigation.ts: konstanta path halaman, menu per peran, dan halaman awal per peran.',
    sharedFiles: [
      { path: 'apps/web/src/main.ts', purpose: 'titik masuk aplikasi', owner: 'BOOTSTRAP' },
      { path: 'apps/web/src/layouts/PublicLayout.vue', purpose: 'layout publik tanpa sidebar', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/layouts/AppLayout.vue', purpose: 'layout aplikasi dengan sidebar', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/router/index.ts', purpose: 'definisi rute dan router.beforeEach', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/lib/navigation.ts', purpose: 'path halaman, menu per peran, halaman awal per peran', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/components/layout/AppSidebar.vue', purpose: 'sidebar; membaca menu dari navigation.ts', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/lib/api-client.ts', purpose: 'satu-satunya pembungkus fetch', owner: 'FONDASI_UI' },
      { path: 'apps/web/src/components/ui/*', purpose: UI_COMPONENTS_PURPOSE, owner: 'FONDASI_UI' },
    ],
    endpointPatterns: ['apps/api/**'],
    uiCheck: {
      extensions: ['.vue'],
      roots: ['apps/web/src'],
      exempt: ['apps/web/src/components/ui/**', 'apps/web/tailwind.config.*', '**/*.css'],
    },
  },
  'laravel-blade': {
    key: 'laravel-blade',
    title: 'Laravel Blade',
    publicLayout: 'layouts/guest.blade.php: tanpa sidebar. Beranda publik, login, daftar, lupa password, dan halaman galat.',
    appLayout: 'layouts/app.blade.php: sidebar dengan menu sesuai peran, nama dan peran user, dan tombol Keluar. Semua halaman setelah login.',
    routeGuard: 'Middleware auth dan peran pada grup rute di routes/web.php; view tidak mengecek sendiri.',
    navigation: 'config/navigation.php: path halaman, menu per peran, dan halaman awal per peran.',
    sharedFiles: [
      { path: 'resources/views/layouts/guest.blade.php', purpose: 'layout publik tanpa sidebar', owner: 'FONDASI_UI' },
      { path: 'resources/views/layouts/app.blade.php', purpose: 'layout aplikasi dengan sidebar', owner: 'FONDASI_UI' },
      { path: 'resources/views/components/layout/sidebar.blade.php', purpose: 'sidebar; membaca menu dari config/navigation.php', owner: 'FONDASI_UI' },
      { path: 'config/navigation.php', purpose: 'path halaman, menu per peran, halaman awal per peran', owner: 'FONDASI_UI' },
      { path: 'resources/views/components/ui/*', purpose: UI_COMPONENTS_PURPOSE, owner: 'FONDASI_UI' },
    ],
    endpointPatterns: ['routes/api.php', 'app/Http/Controllers/**'],
    uiCheck: {
      extensions: ['.blade.php'],
      roots: ['resources/views'],
      exempt: ['resources/views/components/ui/**'],
    },
  },
  generic: {
    key: 'generic',
    title: 'Generik',
    publicLayout: 'Layout publik tanpa sidebar untuk beranda publik, login, daftar, lupa password, dan halaman galat.',
    appLayout: 'Layout aplikasi dengan sidebar menu sesuai peran untuk semua halaman setelah login.',
    routeGuard: 'Guard rute di satu tempat (middleware atau router); halaman tidak mengecek sendiri.',
    navigation: 'Satu file navigasi: path halaman, menu per peran, dan halaman awal per peran.',
    sharedFiles: [],
    endpointPatterns: [],
    uiCheck: null,
  },
};

/** Pilih kontrak berdasarkan framework FRONTEND (kontrak arsitektur berkunci backend). */
export function resolveUiShellContract(stack?: StackContract | null): UiShellContract {
  const fe = (stack?.frontend.framework ?? 'React').toLowerCase();
  const be = (stack?.backend.framework ?? '').toLowerCase();
  if (fe.includes('next')) return UI_SHELL_CONTRACTS.nextjs;
  if (fe.includes('vue')) return UI_SHELL_CONTRACTS['vue-spa'];
  if (fe.includes('react')) return UI_SHELL_CONTRACTS['react-spa'];
  if (fe.includes('blade') || fe.includes('laravel') || be.includes('laravel') || be.includes('php')) return UI_SHELL_CONTRACTS['laravel-blade'];
  return UI_SHELL_CONTRACTS.generic;
}

/**
 * Konfigurasi pemeriksaan gaya untuk stack ini, atau null bila stack tidak memakai Tailwind
 * (mis. CSS modules dari stack rekomendasi AI) atau frameworknya tidak dikenali.
 */
export function resolveUiCheck(stack?: StackContract | null): UiCheckConfig | null {
  if (!stack || !/tailwind/i.test(stack.styling)) return null;
  return resolveUiShellContract(stack).uiCheck;
}

const OWNER_LABEL: Record<SharedFileOwner, string> = {
  BOOTSTRAP: 'task BOOTSTRAP',
  FONDASI_UI: 'task Fondasi UI',
  BACKEND: 'task BACKEND',
};

export function renderUiShellContract(contract: UiShellContract): string {
  const files = contract.sharedFiles.map((f) => `- \`${f.path}\`: ${f.purpose} (dibuat oleh ${OWNER_LABEL[f.owner]})`);
  return `### KONTRAK UI SHELL DAN FILE BERSAMA: ${contract.title}
- Layout publik: ${contract.publicLayout}
- Layout aplikasi: ${contract.appLayout}
- Guard rute: ${contract.routeGuard}
- Navigasi: ${contract.navigation}
${files.length > 0 ? `\nFILE BERSAMA (satu pemilik per file):\n${files.join('\n')}\n` : ''}
ATURAN FILE BERSAMA:
- File bersama hanya dibuat (files_to_create) oleh pemiliknya. Task lain mencantumkannya di files_to_modify atau files_readonly.
- Dilarang membuat file setara dengan nama lain (mis. providers kedua, API client kedua, komponen banner kedua, skema validasi ganda).
- Path halaman, menu sidebar, dan redirect setelah login wajib mengikuti PETA HALAMAN dan file navigasi di atas, bukan ditulis ulang per komponen.`;
}

/** Ringkasan pendek untuk `numa context` task FRONTEND. */
export function summarizeUiShell(contract: UiShellContract): string[] {
  const lines = [
    `Kontrak UI shell: ${contract.title}`,
    `Layout publik (tanpa sidebar): ${contract.publicLayout}`,
    `Layout aplikasi (sidebar): ${contract.appLayout}`,
    `Guard rute: ${contract.routeGuard}`,
    `Navigasi: ${contract.navigation}`,
  ];
  for (const f of contract.sharedFiles) lines.push(`File bersama: ${f.path} (${f.purpose}; pemilik ${OWNER_LABEL[f.owner]})`);
  return lines;
}

const globRegex = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000/g, '.*')}$`,
  );

export function normalizeFilePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/** True bila path file termasuk file pendefinisi endpoint API menurut kontrak (mis. src/app/api/**). */
export function isEndpointFile(contract: UiShellContract, path: string): boolean {
  const p = normalizeFilePath(path);
  return contract.endpointPatterns.some((pattern) => globRegex(pattern).test(p));
}

/** True bila path persis sama dengan file bersama pada kontrak (pola `*` dan `<domain>` dicocokkan sebagai wildcard). */
export function findSharedFile(contract: UiShellContract, path: string): SharedFile | undefined {
  const p = normalizeFilePath(path);
  return contract.sharedFiles.find((f) => {
    if (!f.path.includes('*') && !f.path.includes('<')) return f.path === p;
    return globRegex(f.path.replace(/<[^>]+>/g, '*')).test(p);
  });
}
