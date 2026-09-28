// Golden Stack: 4 paket teknologi terstandarisasi dengan kontrak arsitektur ketat
import { parseStackEntry, resolveStackContract, type StackContract } from './stack-contract.js';

export interface GoldenPack {
  id: 'react-express' | 'vue-nest' | 'nextjs-fullstack' | 'laravel';
  title: string;
  description: string;
  tags: string[];
  dbOptions: string[];
}

export const GOLDEN_PACKS: GoldenPack[] = [
  {
    id: 'react-express',
    title: 'React + Express',
    description: 'Fullstack TypeScript modular: React 18, Express, Prisma ORM',
    tags: ['frontend:React v18', 'backend:TypeScript + Express', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      'database:SQLite + Prisma',
      'database:PostgreSQL + Prisma',
      'database:MySQL + Prisma',
      'database:Supabase (Postgres) + Prisma',
    ],
  },
  {
    id: 'vue-nest',
    title: 'Vue + NestJS',
    description: 'Arsitektur modular enterprise: NestJS (DI/Providers), Vue 3, Prisma ORM',
    tags: ['frontend:Vue.js v3', 'backend:NestJS', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      'database:SQLite + Prisma',
      'database:PostgreSQL + Prisma',
      'database:MySQL + Prisma',
      'database:Supabase (Postgres) + Prisma',
    ],
  },
  {
    id: 'nextjs-fullstack',
    title: 'Next.js Fullstack',
    description: 'Framework all-in-one React: App Router, Server Actions, Route Handlers, Prisma ORM',
    tags: ['frontend:Next.js 14', 'backend:Next.js', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      'database:SQLite + Prisma',
      'database:PostgreSQL + Prisma',
      'database:MySQL + Prisma',
      'database:Supabase (Postgres) + Prisma',
    ],
  },
  {
    id: 'laravel',
    title: 'Laravel PHP',
    description: 'Monolit MVC tangguh: Laravel, Blade/Tailwind, Eloquent ORM',
    tags: ['frontend:Tailwind CSS', 'backend:Laravel PHP', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      'database:MySQL + Eloquent',
      'database:PostgreSQL + Eloquent',
      'database:SQLite + Eloquent',
    ],
  },
];

export function validateGoldenSelection(tags: string[]): { ok: true; packId: GoldenPack['id']; contract: StackContract } | { ok: false; error: string } {
  if (!Array.isArray(tags) || tags.length === 0) {
    return { ok: false, error: 'Pilihan tech stack tidak boleh kosong.' };
  }

  const combined = tags.join(' ').toLowerCase();

  // Larang database / ORM di luar kontrak
  if (combined.includes('mongo') || combined.includes('drizzle') || combined.includes('typeorm')) {
    return { ok: false, error: 'Database atau ORM tersebut tidak didukung dalam Golden Stack Numa.' };
  }

  const parsed = tags.map(parseStackEntry);
  const contract = resolveStackContract(parsed);

  const fe = contract.frontend.framework.toLowerCase();
  const be = contract.backend.framework.toLowerCase();
  const dbEngine = contract.database.engine.toLowerCase();
  const orm = (contract.database.orm || '').toLowerCase();

  let matchedPackId: GoldenPack['id'] | null = null;

  if (be.includes('laravel') || be.includes('php')) {
    matchedPackId = 'laravel';
    if (!['mysql', 'postgresql', 'sqlite'].includes(dbEngine)) {
      return { ok: false, error: 'Laravel hanya mendukung database MySQL, PostgreSQL, atau SQLite.' };
    }
  } else if (fe.includes('next') || be.includes('next')) {
    matchedPackId = 'nextjs-fullstack';
  } else if (be.includes('nest')) {
    matchedPackId = 'vue-nest';
  } else if (be.includes('express')) {
    matchedPackId = 'react-express';
  }

  if (!matchedPackId) {
    return { ok: false, error: 'Kombinasi backend dan frontend harus sesuai 4 Golden Stack Numa (React+Express, Vue+NestJS, Next.js, atau Laravel).' };
  }

  if (matchedPackId !== 'laravel') {
    if (!['sqlite', 'postgresql', 'mysql'].includes(dbEngine) && !combined.includes('supabase')) {
      return { ok: false, error: 'Database Node hanya mendukung SQLite, PostgreSQL, MySQL, atau Supabase.' };
    }
    if (orm && !orm.includes('prisma')) {
      return { ok: false, error: 'Backend Node wajib menggunakan Prisma ORM.' };
    }
  }

  return { ok: true, packId: matchedPackId, contract };
}

export function normalizeToGoldenPack(techStack: string[]): string[] {
  const combined = (techStack || []).join(' ').toLowerCase();

  if (combined.includes('laravel') || combined.includes('php')) {
    const db = combined.includes('postgres')
      ? 'database:PostgreSQL + Eloquent'
      : combined.includes('sqlite')
      ? 'database:SQLite + Eloquent'
      : 'database:MySQL + Eloquent';
    return ['frontend:Tailwind CSS', 'backend:Laravel PHP', db, 'styling:Tailwind CSS', 'testing:Playwright'];
  }

  if (combined.includes('nest')) {
    const db = combined.includes('sqlite')
      ? 'database:SQLite + Prisma'
      : combined.includes('mysql')
      ? 'database:MySQL + Prisma'
      : combined.includes('supabase')
      ? 'database:Supabase (Postgres) + Prisma'
      : 'database:PostgreSQL + Prisma';
    return ['frontend:Vue.js v3', 'backend:NestJS', db, 'styling:Tailwind CSS', 'testing:Playwright'];
  }

  if (combined.includes('next')) {
    const db = combined.includes('sqlite')
      ? 'database:SQLite + Prisma'
      : combined.includes('mysql')
      ? 'database:MySQL + Prisma'
      : combined.includes('supabase')
      ? 'database:Supabase (Postgres) + Prisma'
      : 'database:PostgreSQL + Prisma';
    return ['frontend:Next.js 14', 'backend:Next.js', db, 'styling:Tailwind CSS', 'testing:Playwright'];
  }

  const db = combined.includes('sqlite')
    ? 'database:SQLite + Prisma'
    : combined.includes('mysql')
    ? 'database:MySQL + Prisma'
    : combined.includes('supabase')
    ? 'database:Supabase (Postgres) + Prisma'
    : 'database:PostgreSQL + Prisma';
  return ['frontend:React v18', 'backend:TypeScript + Express', db, 'styling:Tailwind CSS', 'testing:Playwright'];
}
