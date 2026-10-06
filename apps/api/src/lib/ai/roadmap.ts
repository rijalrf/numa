// Generate roadmap (phases + features + dependencies) dari PRD.
import { z } from 'zod';
import { generateJson } from './ai-service.js';
import type { PrdData } from './prd.js';
import { PROMPT_VERSIONS } from './prompts.js';

const RoadmapSchema = z.object({
  phases: z
    .array(
      z.object({
        order: z.number().int().min(1),
        title: z.string(),
        description: z.string().optional(),
        layer: z.enum(['BOOTSTRAP', 'DATABASE', 'BACKEND', 'FRONTEND', 'INTEGRATION']),
        features: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              description: z.string().optional(),
              dependsOn: z.array(z.string()).default([]),
            }),
          )
          .min(1),
      }),
    )
    .min(2),
});

export type RoadmapData = z.infer<typeof RoadmapSchema>;

export async function generateRoadmapFromPRD(prd: PrdData, opts: { projectId: string }): Promise<RoadmapData> {
  const system = `Anda adalah Desainer Sistem teknis. Pecah PRD menjadi Feature Execution Graph terstruktur.
Setiap fase mengelompokkan layer delivery secara ketat: BOOTSTRAP -> DATABASE -> BACKEND -> FRONTEND -> INTEGRATION.
Setiap fitur dalam fase wajib memodelkan dependensi logis (dependsOn) ke fitur prasyarat agar eksekusi task otonom berjalan berurutan tanpa race conditions atau circular dependency.

ATURAN STRUKTUR LAYER:
1. Fase 1 WAJIB berlayer 'BOOTSTRAP': inisialisasi project, konfigurasi package.json, tsconfig, struktur folder, variabel lingkungan (.env), .gitignore (wajib exclude node_modules, .env, *.db, dist), .env.example, README.md (cara install & jalankan), dan kontrak tipe bersama.
2. Fase DATABASE: perancangan skema data (Prisma/SQL), migrasi, dan seed data awal. Bergantung pada BOOTSTRAP.
3. Fase BACKEND: implementasi controller/route API sesuai spesifikasi PRD. Bergantung pada fitur DATABASE terkait.
4. Fase FRONTEND: implementasi halaman UI, komponen, dan konsumsi API backend. Bergantung pada fitur BACKEND terkait.
5. Fase TERAKHIR WAJIB berlayer 'INTEGRATION': mencakup WIRING (menghubungkan FE ke API BE sesungguhnya, BE ke DB) dan smoke test lokal (aplikasi bisa dijalankan end-to-end tanpa error).`;

  const prdText = typeof prd === 'string' ? prd : (prd as any).markdown ? (prd as any).markdown : JSON.stringify(prd, null, 2);
  const user = `PRD:
${prdText}

Schema JSON:
{
  "phases": [
    {
      "order": number,
      "title": string,
      "description"?: string,
      "layer": "BOOTSTRAP" | "DATABASE" | "BACKEND" | "FRONTEND" | "INTEGRATION",
      "features": [
        {
          "id": string (slug unik, mis. "bootstrap-init", "auth-db", "product-api", "cart-ui", "e2e-wiring"),
          "title": string,
          "description"?: string,
          "dependsOn": string[] (array slug fitur prasyarat yang harus selesai lebih dulu)
        }
      ]
    }
  ]
}

PRINSIP EXECUTION GRAPH:
1. Fase BOOTSTRAP WAJIB menjadi fase pertama (order: 1) tanpa dependensi (dependsOn: []).
2. Fitur layer DATABASE bergantung pada fitur BOOTSTRAP.
3. Fitur layer BACKEND umumnya bergantung (dependsOn) pada fitur DATABASE terkait.
4. Fitur layer FRONTEND umumnya bergantung pada fitur BACKEND terkait.
5. Fitur INTEGRATION bergantung pada fitur FRONTEND & BACKEND inti.
6. INTEGRATION WAJIB mencakup: task wiring integrasi nyata (bukan hanya test setup), dan smoke test "npm run dev berhasil dan halaman utama dapat diakses".
7. Jangan membuat siklus ketergantungan (circular dependency).
8. Minimal 4-5 fase, total fitur 5-15. Kembalikan HANYA JSON.`;

  return generateJson({
    system,
    user,
    schema: RoadmapSchema,
    agentName: 'FeatureExecutionGraph',
    promptVersion: PROMPT_VERSIONS.roadmap,
    projectId: opts.projectId,
  });
}
