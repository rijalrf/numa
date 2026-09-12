// Stack Contract: schema, parser, dan resolver deterministik dari pilihan tech stack user
import { z } from 'zod';

export const StackContractSchema = z.object({
  frontend: z.object({
    framework: z.string().default('React'),
    version: z.string().nullable().default('18'),
  }),
  backend: z.object({
    framework: z.string().default('Express'),
    version: z.string().nullable().default(null),
  }),
  database: z.object({
    engine: z.string().default('SQLite'),
    orm: z.string().nullable().default('Prisma'),
  }),
  styling: z.string().default('Tailwind CSS'),
  testing: z.string().default('Playwright'),
});

export type StackContract = z.infer<typeof StackContractSchema>;

export function parseStackEntry(s: string): { category: string; name: string; version: string | null } {
  if (typeof s !== 'string') return { category: 'general', name: 'Stack', version: null };
  const trimmed = s.trim();
  const colonIdx = trimmed.indexOf(':');
  let category = 'general';
  let rest = trimmed;

  if (colonIdx !== -1) {
    category = trimmed.slice(0, colonIdx).trim().toLowerCase();
    rest = trimmed.slice(colonIdx + 1).trim();
  }

  const vMatch = rest.match(/\bv?(\d+(?:\.\d+)*(?:\s*LTS)?)\s*$/i);
  let version: string | null = null;
  let name = rest;

  if (vMatch && vMatch.index !== undefined) {
    version = vMatch[1];
    name = rest.slice(0, vMatch.index).trim().replace(/[+\s]+$/, '');
  }

  return {
    category: category || 'general',
    name: name || rest || 'Stack',
    version,
  };
}

export function resolveStackContract(
  stacks: Array<{ category: string; name: string; version?: string | null }>
): StackContract {
  let frontendFramework = 'React';
  let frontendVersion: string | null = '18';

  let backendFramework = 'Express';
  let backendVersion: string | null = null;

  let dbEngine = 'SQLite';
  let dbOrm: string | null = 'Prisma';

  let styling = 'Tailwind CSS';
  let testing = 'Playwright';

  for (const s of stacks) {
    const combined = `${s.category} ${s.name} ${s.version ?? ''}`.toLowerCase();
    // Abaikan baris legacy yang salah parsing: name masih berisi nama kategori, bukan framework
    const legacyName = ['frontend', 'backend', 'database', 'styling', 'testing', 'general'].includes(s.name.toLowerCase());

    // 1. Frontend Framework
    if (s.category === 'frontend' || combined.includes('frontend')) {
      if (combined.includes('next')) {
        frontendFramework = 'Next.js';
      } else if (combined.includes('vue')) {
        frontendFramework = 'Vue';
      } else if (combined.includes('svelte')) {
        frontendFramework = 'Svelte';
      } else if (combined.includes('react')) {
        frontendFramework = 'React';
      } else if (!legacyName) {
        frontendFramework = s.name;
      }
      if (s.version) frontendVersion = s.version;
    } else if (combined.includes('next')) {
      frontendFramework = 'Next.js';
      if (s.version) frontendVersion = s.version;
    } else if (combined.includes('vue')) {
      frontendFramework = 'Vue';
      if (s.version) frontendVersion = s.version;
    } else if (combined.includes('svelte')) {
      frontendFramework = 'Svelte';
      if (s.version) frontendVersion = s.version;
    }

    // 2. Backend Framework
    if (s.category === 'backend' || combined.includes('backend')) {
      if (combined.includes('fastify')) {
        backendFramework = 'Fastify';
      } else if (combined.includes('hono')) {
        backendFramework = 'Hono';
      } else if (combined.includes('nest')) {
        backendFramework = 'NestJS';
      } else if (combined.includes('laravel') || combined.includes('php')) {
        backendFramework = 'Laravel';
      } else if (combined.includes('django')) {
        backendFramework = 'Django';
      } else if (combined.includes('fastapi')) {
        backendFramework = 'FastAPI';
      } else if (combined.includes('flask')) {
        backendFramework = 'Flask';
      } else if (combined.includes('go') || combined.includes('gin') || combined.includes('fiber')) {
        backendFramework = 'Go';
      } else if (combined.includes('spring')) {
        backendFramework = 'Spring Boot';
      } else if (combined.includes('rails')) {
        backendFramework = 'Ruby on Rails';
      } else if (combined.includes('express')) {
        backendFramework = 'Express';
      } else if (!legacyName) {
        backendFramework = s.name;
      }
      if (s.version) backendVersion = s.version;
    } else if (combined.includes('fastify')) {
      backendFramework = 'Fastify';
    } else if (combined.includes('hono')) {
      backendFramework = 'Hono';
    } else if (combined.includes('nest')) {
      backendFramework = 'NestJS';
    } else if (combined.includes('laravel') || combined.includes('php')) {
      backendFramework = 'Laravel';
    } else if (combined.includes('django')) {
      backendFramework = 'Django';
    } else if (combined.includes('fastapi')) {
      backendFramework = 'FastAPI';
    } else if (combined.includes('flask')) {
      backendFramework = 'Flask';
    } else if (combined.includes('go') || combined.includes('gin') || combined.includes('fiber')) {
      backendFramework = 'Go';
    } else if (combined.includes('spring')) {
      backendFramework = 'Spring Boot';
    } else if (combined.includes('rails')) {
      backendFramework = 'Ruby on Rails';
    }

    // 3. Database & ORM
    if (s.category === 'database' || combined.includes('database')) {
      if (combined.includes('postgres')) {
        dbEngine = 'PostgreSQL';
      } else if (combined.includes('mysql')) {
        dbEngine = 'MySQL';
      } else if (combined.includes('mongo')) {
        dbEngine = 'MongoDB';
      } else if (combined.includes('sqlite')) {
        dbEngine = 'SQLite';
      }

      if (combined.includes('drizzle')) {
        dbOrm = 'Drizzle';
      } else if (combined.includes('typeorm')) {
        dbOrm = 'TypeORM';
      } else if (combined.includes('prisma')) {
        dbOrm = 'Prisma';
      } else if (combined.includes('eloquent')) {
        dbOrm = 'Eloquent';
      }
    }

    // 4. Styling
    if (s.category === 'styling' || combined.includes('styling') || combined.includes('tailwind')) {
      if (combined.includes('tailwind')) {
        styling = 'Tailwind CSS';
      } else if (combined.includes('module')) {
        styling = 'CSS Modules';
      } else if (combined.includes('styled')) {
        styling = 'Styled Components';
      }
    }

    // 5. Testing
    if (s.category === 'testing' || combined.includes('testing') || combined.includes('playwright')) {
      if (combined.includes('playwright')) {
        testing = 'Playwright';
      } else if (combined.includes('cypress')) {
        testing = 'Cypress';
      } else if (combined.includes('vitest')) {
        testing = 'Vitest';
      }
    }
  }

  // Otomatis sesuaikan ORM default sesuai framework backend jika ORM masih default Prisma
  const beLower = backendFramework.toLowerCase();
  if (beLower.includes('laravel') || beLower.includes('php')) {
    if (dbOrm === 'Prisma' || !dbOrm) dbOrm = 'Eloquent';
  } else if (beLower.includes('django')) {
    if (dbOrm === 'Prisma' || !dbOrm) dbOrm = 'Django ORM';
  } else if (beLower.includes('rails')) {
    if (dbOrm === 'Prisma' || !dbOrm) dbOrm = 'ActiveRecord';
  } else if (beLower.includes('go')) {
    if (dbOrm === 'Prisma' || !dbOrm) dbOrm = 'GORM';
  }

  return {
    frontend: { framework: frontendFramework, version: frontendVersion },
    backend: { framework: backendFramework, version: backendVersion },
    database: { engine: dbEngine, orm: dbOrm },
    styling,
    testing,
  };
}
