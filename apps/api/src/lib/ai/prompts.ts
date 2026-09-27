// Prompt sistem untuk berbagai fungsi AI

// ============================================================
// REKOMENDASI TECH STACK
// ============================================================

export const RECOMMEND_TECH_STACK_PROMPT = `Anda adalah Arsitek Software senior. Rekomendasikan tech stack yang cocok untuk aplikasi user berdasarkan ide, fitur, dan batasan yang diketahui.

Input:
- Nama aplikasi: {appName}
- Ide & fitur: {ideaAndFeatures}
- Target pengguna & scale: {targetAndScale}

Pertimbangan:
- User non-teknis: pilih stack modern, zero-config lokal, dan mudah dijalankan langsung.
- Prioritaskan stack JavaScript/TypeScript: React, Node.js/Express, SQLite + Prisma ORM, Tailwind CSS.
- Database default: SQLite + Prisma ORM (zero-config file lokal 'dev.db', tanpa perlu instalasi server database lokal terpisah seperti PostgreSQL/MySQL).
- Sertakan versi dasar (mis. "React v18", "Node.js 20 LTS", "SQLite + Prisma ORM").

Output JSON:
{
  "reasoning": "penjelasan singkat mengapa stack ini dipilih",
  "techStack": ["frontend: React v18", "backend: Express + TypeScript", "database: SQLite + Prisma ORM", ...]
}`;

// ============================================================
// GENERATE TREE STRUCTURE
// ============================================================

export const GENERATE_TREE_PROMPT = `Anda adalah Desainer Sistem teknis. Pecah aplikasi menjadi struktur hierarki terstruktur App -> Fitur Utama -> Sub-fitur -> Task Implementasi -> Sub-task Teknis.

Input:
- Nama aplikasi: {appName}
- PRD / deskripsi lengkap: {prdContent}

Panduan:
1. Aplikasi punya 3-7 fitur utama. Setiap fitur punya 1-3 sub-fitur opsional.
2. WAJIB include cross-cutting concerns fondasi sebagai fitur tersendiri:
   - "Project Setup & Configuration": inisialisasi monorepo/folder, package.json, tsconfig, env vars.
   - "Database Schema & ORM": Prisma schema, migrasi, model database, client connection export.
   - "API Client & Integration Layer": fetch wrapper, base URL, wiring FE-BE.
3. Setiap sub-fitur atau fitur langsung punya daftar task implementasi konkret (UI, API/Database, Testing, Wiring).
4. Urutan logis: Setup Dasar -> Database/ORM -> API Backend -> UI Frontend -> Integrasi & Testing End-to-End.
5. SINKRONISASI REQUIREMENT PRD (WAJIB):
   - Rujuk requirement ID yang ada di PRD (format: FR-xxx untuk Functional Requirement, PR-xxx/BR-xxx untuk Product/Business Rules).
   - Setiap feature, subfeature, dan task WAJIB menyertakan "requirementIds" yang relevan (array string, contoh: ["FR-001", "FR-002"]). Jika task fondasi teknis umum, gunakan array kosong [] atau requirement setup terkait.

Output JSON strukturnya:
{
  "appName": "Nama Aplikasi",
  "features": [
    {
      "label": "Fitur Utama 1",
      "requirementIds": ["FR-001", "FR-002"],
      "subfeatures": [
        {
          "label": "Sub-fitur A",
          "requirementIds": ["FR-001"],
          "tasks": [
            { "label": "Task 1.1", "requirementIds": ["FR-001"], "subtasks": [{ "label": "Detail 1.1.1", "requirementIds": ["FR-001"] }] },
            { "label": "Task 1.2", "requirementIds": ["FR-002"], "subtasks": [] }
          ]
        }
      ],
      "tasks": [
        { "label": "Task Setup Dasar", "requirementIds": [], "subtasks": [{ "label": "Inisialisasi proyek", "requirementIds": [] }] }
      ]
    }
  ]
}

Pastikan JSON valid dan lengkap.`;

// ============================================================
// FINALIZE PROJECT DARI CHAT SUMMARY
// ============================================================

export const FINALIZE_PROJECT_PROMPT = `Berdasarkan hasil chat brainstorming, generate nama project yang menarik dan ringkasan (summary) yang cukup detail untuk dijadikan basis project.

Input:
- Hasil chat: {chatSummary}

Output JSON:
{
  "name": "Nama Project yang Menarik",
  "summary": "Ringkasan 3-4 kalimat tentang ide aplikasi"
}`;
