// Generate roadmap (phases + features + dependencies) dari spec PRD dan tech stack terpilih.
import { z } from 'zod';
import { generateJson } from './ai-service.js';
import type { PrdDoc } from './prd.js';
import { PROMPT_VERSIONS } from './prompts.js';
import type { StackContract } from './stack-contract.js';

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

// Batas karakter markdown PRD bila spec tidak tersedia (PRD lama atau ekstraksi spec gagal).
const MARKDOWN_FALLBACK_LIMIT = 30000;
const REQUIREMENT_LIMIT = 80;

/**
 * Input roadmap. Spec terstruktur (entitas, endpoint, journey) beserta indeks requirement jauh lebih ringkas
 * dari markdown PRD penuh; markdown hanya dipakai bila spec tidak ada.
 */
export function buildRoadmapInput(prd: PrdDoc, stack?: StackContract): string {
  const stackText = stack
    ? `TECH STACK TERPILIH:\n- Frontend: ${stack.frontend.framework}\n- Backend: ${stack.backend.framework}\n- Database: ${stack.database.engine}${stack.database.orm ? ` (ORM: ${stack.database.orm})` : ''}\n- Testing: ${stack.testing}\n\n`
    : '';

  const { spec } = prd;
  if (!spec) {
    return `${stackText}PRD:\n${prd.markdown.slice(0, MARKDOWN_FALLBACK_LIMIT)}`;
  }

  const lines: string[] = ['SPEC TERSTRUKTUR PRD:'];
  if (spec.personas.length > 0) lines.push(`Persona: ${spec.personas.map((p) => p.name).join(', ')}`);
  if (spec.entities.length > 0) {
    lines.push('Entitas:');
    for (const e of spec.entities) lines.push(`- ${e.name} (${e.fields.map((f) => f.name).join(', ')})`);
  }
  if (spec.endpoints.length > 0) {
    lines.push('Endpoint:');
    for (const ep of spec.endpoints) lines.push(`- ${ep.method} ${ep.path}${ep.authRequired ? ' [auth]' : ''}: ${ep.description}`);
  }
  if (spec.journeys.length > 0) {
    lines.push('Journey:');
    for (const j of spec.journeys) lines.push(`- ${j.name} (${j.kind === 'failure' ? 'gagal' : 'utama'}): ${j.steps.length} langkah`);
  }
  const reqs = prd.requirementIndex.slice(0, REQUIREMENT_LIMIT);
  if (reqs.length > 0) {
    lines.push('Requirement:');
    for (const r of reqs) lines.push(`- [${r.id}] ${r.title}`);
  }
  return `${stackText}${lines.join('\n')}`;
}

export async function generateRoadmapFromPRD(prd: PrdDoc, opts: { projectId: string; stack?: StackContract }): Promise<RoadmapData> {
  const system = `Anda adalah Desainer Sistem teknis. Pecah kebutuhan produk menjadi Feature Execution Graph terstruktur.
Setiap fase mengelompokkan layer delivery secara ketat: BOOTSTRAP -> DATABASE -> BACKEND -> FRONTEND -> INTEGRATION.
Setiap fitur dalam fase wajib memodelkan dependensi logis (dependsOn) ke fitur prasyarat agar eksekusi task otonom berjalan berurutan tanpa race conditions atau circular dependency.
Ikuti TECH STACK TERPILIH pada pesan user; jangan berasumsi stack lain.

ATURAN STRUKTUR LAYER:
1. Fase 1 WAJIB berlayer 'BOOTSTRAP': inisialisasi project, konfigurasi dependensi dan build sesuai stack, struktur folder, variabel lingkungan (.env), .gitignore (wajib exclude dependensi, .env, berkas database lokal, hasil build), .env.example, README.md (cara install & jalankan), dan kontrak tipe bersama bila relevan.
2. Fase DATABASE: perancangan skema data, migrasi, dan seed data awal sesuai ORM/stack. Bergantung pada BOOTSTRAP.
3. Fase BACKEND: implementasi controller/route API sesuai spesifikasi. Bergantung pada fitur DATABASE terkait.
4. Fase FRONTEND: implementasi halaman UI, komponen, dan konsumsi API backend. Bergantung pada fitur BACKEND terkait.
5. Fase TERAKHIR WAJIB berlayer 'INTEGRATION': mencakup WIRING (menghubungkan FE ke API BE sesungguhnya, BE ke DB) dan smoke test lokal (aplikasi bisa dijalankan end-to-end tanpa error).`;

  const user = `${buildRoadmapInput(prd, opts.stack)}

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
6. INTEGRATION WAJIB mencakup: task wiring integrasi nyata (bukan hanya test setup), dan smoke test: aplikasi dapat dijalankan dengan perintah standar stack terpilih dan halaman utama dapat diakses.
7. Jangan membuat siklus ketergantungan (circular dependency).
8. Minimal 4-5 fase, total fitur 5-15. Kembalikan HANYA JSON.`;

  return generateJson({
    system,
    user,
    schema: RoadmapSchema,
    agentName: 'FeatureExecutionGraph',
    promptVersion: PROMPT_VERSIONS.roadmap,
    projectId: opts.projectId,
    tier: 'cheap',
  });
}
