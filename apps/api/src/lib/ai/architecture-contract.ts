// Kontrak arsitektur berlapis (layered architecture contract) per framework backend
import type { StackContract } from './stack-contract.js';

export interface ArchitectureContract {
  key: 'express' | 'nestjs' | 'nextjs' | 'laravel';
  title: string;
  framework: string;
  layeringRules: string[];
  folderStructure: string;
  errorHandling: string[];
  forbidden: string[];
}

export const ARCHITECTURE_CONTRACTS: Record<ArchitectureContract['key'], ArchitectureContract> = {
  express: {
    key: 'express',
    title: 'TypeScript Express Layered Architecture',
    framework: 'Express',
    layeringRules: [
      '1. Routes (src/routes/*): Hanya mendefinisikan path URL, HTTP method, validasi Zod, dan memanggil Controller. Dilarang menulis logika bisnis atau query database di route.',
      '2. Controllers (src/controllers/*): Mengambil request params/body yang sudah divalidasi, memanggil Service, dan mengembalikan HTTP JSON response dengan status code yang tepat. Wajib menangani async error (try-catch atau wrapper).',
      '3. Services (src/services/*): Memuat seluruh aturan dan logika bisnis. Dilarang berinteraksi langsung dengan objek HTTP (req/res). Memanggil Repository untuk akses data persisten.',
      '4. Repositories (src/repositories/*): Layer eksklusif untuk akses data dan pemanggilan Prisma Client. Controller dan Service dilarang mengimpor atau memanggil prisma secara langsung.',
    ],
    folderStructure: `apps/api/src/
├── routes/        # Router definitions & Zod schema validation
├── controllers/   # Thin HTTP controllers (delegasi ke service)
├── services/      # Business logic & domain operations
├── repositories/  # Data access layer (Prisma calls ONLY here)
├── middleware/    # Auth, centralized error-handler, CORS
└── lib/           # Singleton prisma client & env config`,
    errorHandling: [
      'Gunakan centralized error middleware di akhir pipeline Express.',
      'Controller async dilarang membiarkan uncaught exception tanpa penanganan.',
      'Format JSON error wajib konsisten: { "error": string, "code"?: string, "details"?: unknown }.',
    ],
    forbidden: [
      'Dilarang memanggil Prisma Client langsung di dalam Controller atau Route.',
      'Dilarang memanggil API eksternal (axios, fetch) langsung di Controller; gunakan Service wrapper.',
      'Dilarang hardcode credentials, secrets, atau URL; gunakan process.env.',
    ],
  },
  nestjs: {
    key: 'nestjs',
    title: 'NestJS Modular Architecture & Dependency Injection',
    framework: 'NestJS',
    layeringRules: [
      '1. Controllers (*.controller.ts): Menerima HTTP request melalui decorators (@Get, @Post), validasi DTO via ValidationPipe/Zod, dan mendelegasikan ke Service via Dependency Injection.',
      '2. Services (*.service.ts): Provider beranotasi @Injectable() yang memuat logika bisnis domain. Menginjeksi Repository provider untuk operasi persistensi data.',
      '3. Repositories (*.repository.ts): Provider beranotasi @Injectable() yang membungkus PrismaService. Satu-satunya layer yang menjalankan query database.',
      '4. Modules (*.module.ts): Mendeklarasikan controllers dan mengaitkan providers secara terisolasi dan modular.',
    ],
    folderStructure: `apps/api/src/
├── modules/
│   └── <feature>/
│       ├── dto/                  # Request/Response DTOs
│       ├── <feature>.controller.ts
│       ├── <feature>.service.ts
│       ├── <feature>.repository.ts
│       └── <feature>.module.ts
├── common/                       # Filters, guards, interceptors, pipes
├── prisma/                       # PrismaService & PrismaModule
└── app.module.ts`,
    errorHandling: [
      'Gunakan exception bawaan NestJS (HttpException, NotFoundException, BadRequestException).',
      'Wajib ada Global Exception Filter untuk menyeragamkan format JSON error response.',
    ],
    forbidden: [
      'Dilarang membuat instance class secara manual dengan "new"; wajib menggunakan NestJS Dependency Injection.',
      'Controller dilarang menginjeksi atau memanggil PrismaService secara langsung; wajib lewat Repository.',
    ],
  },
  nextjs: {
    key: 'nextjs',
    title: 'Next.js App Router Clean Architecture',
    framework: 'Next.js',
    layeringRules: [
      '1. Presentation / UI (src/app/**/page.tsx, components/*): Server Components & Client Components. Client Component memanggil Server Actions atau API Route Client.',
      '2. Actions & Route Handlers (src/app/**/actions.ts, src/app/api/**/route.ts): Validasi input dengan Zod, otorisasi sesi, memanggil Service.',
      '3. Services (src/lib/services/*): Logika bisnis domain murni, validasi aturan bisnis, kalkulasi data.',
      '4. Repositories (src/lib/repositories/* atau src/lib/data/*): Satu-satunya layer yang mengimpor prisma singleton dan menjalankan query database.',
    ],
    folderStructure: `src/
├── app/                     # App Router: pages, layouts, server actions, route handlers
├── components/              # Reusable UI components & shadcn
├── lib/
│   ├── services/            # Business logic
│   ├── repositories/        # Database access (Prisma queries only)
│   ├── validations/         # Zod schemas
│   └── prisma.ts            # Prisma client singleton`,
    errorHandling: [
      'Server Actions wajib mengembalikan objek hasil terstruktur: { success: boolean, data?: T, error?: string }.',
      'API Route Handlers wajib menangani try-catch dan mengembalikan NextResponse.json({ error: string }, { status: ... }).',
    ],
    forbidden: [
      'Dilarang mengimpor atau memanggil prisma langsung di dalam body React Server Component atau Client Component.',
      'Dilarang menjalankan query database langsung di dalam Route Handler tanpa melalui Repository.',
    ],
  },
  laravel: {
    key: 'laravel',
    title: 'Laravel MVC Layered Architecture',
    framework: 'Laravel',
    layeringRules: [
      '1. Controllers (app/Http/Controllers/*): Menerima FormRequest terverifikasi, mendelegasikan ke Service, dan mengembalikan JsonResponse / API Resource.',
      '2. Form Requests (app/Http/Requests/*): Mengisolasi aturan otorisasi dan validasi input sebelum eksekusi controller.',
      '3. Services (app/Services/*): Memuat aturan bisnis, kalkulasi domain, dan orkestrasi alur kerja aplikasi.',
      '4. Repositories (app/Repositories/*): Mengisolasi pemanggilan Eloquent Model dan query builder. Controller dilarang query Eloquent langsung.',
    ],
    folderStructure: `app/
├── Http/
│   ├── Controllers/         # Thin API controllers
│   ├── Requests/            # Form request validation classes
│   └── Resources/           # API Resource JSON transformers
├── Services/                # Business logic & domain operations
├── Repositories/            # Data access layer (Eloquent queries only)
└── Models/                  # Eloquent models & relations`,
    errorHandling: [
      'Tangani exception melalui app/Exceptions/Handler.php untuk respon JSON seragam.',
      'Validasi gagal otomatis mengembalikan HTTP 422 dengan rincian pesan error validasi.',
    ],
    forbidden: [
      'Controller dilarang memanggil Model::query(), Model::create(), atau Model::find() secara langsung.',
      'Dilarang bypass validasi request; setiap mutasi wajib melalui FormRequest class.',
    ],
  },
};

export function resolveArchitectureContract(stack?: StackContract | null): ArchitectureContract {
  const be = (stack?.backend.framework ?? 'Express').toLowerCase();
  const fe = (stack?.frontend.framework ?? 'React').toLowerCase();

  if (be.includes('laravel') || be.includes('php')) {
    return ARCHITECTURE_CONTRACTS.laravel;
  }
  if (fe.includes('next') || be.includes('next')) {
    return ARCHITECTURE_CONTRACTS.nextjs;
  }
  if (be.includes('nest')) {
    return ARCHITECTURE_CONTRACTS.nestjs;
  }
  return ARCHITECTURE_CONTRACTS.express;
}

export function renderArchitectureContract(contract: ArchitectureContract): string {
  return `### KONTRAK ARSITEKTUR WAJIB: ${contract.title}
Framework: ${contract.framework}

ATURAN LAYERING & TANGGUNG JAWAB:
${contract.layeringRules.join('\n')}

STRUKTUR FOLDER STANDAR:
\`\`\`
${contract.folderStructure}
\`\`\`

PENANGANAN ERROR & RESPONSE:
${contract.errorHandling.map((e) => `- ${e}`).join('\n')}

LARANGAN KERAS (ANTI-PATTERNS):
${contract.forbidden.map((f) => `- ${f}`).join('\n')}`;
}
