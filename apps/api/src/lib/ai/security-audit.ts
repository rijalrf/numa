// Security Audit Sub-pipeline untuk generated tasks
// Menjalankan audit AppSec pra-implementasi dan menyuntikkan kriteria keamanan ke tasks
import { z } from 'zod';
import { generateJson } from './ai-service.js';
import type { TaskGen } from './tasks.js';
import type { PrdData } from './prd.js';
import { PROMPT_VERSIONS } from './prompts.js';

export const SecurityFindingSchema = z.object({
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  category: z.enum([
    'HARDCODED_SECRET',
    'MISSING_AUTH',
    'INJECTION_RISK',
    'UNPROTECTED_ROUTE',
    'MISSING_VALIDATION',
    'MISSING_RATE_LIMIT',
    'IDOR',
    'DATA_LEAK',
    'INSECURE_DEPENDENCY',
  ]),
  taskId: z.string(),
  description: z.string(),
  recommendation: z.string(),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityAuditResultSchema = z.object({
  findings: z.array(SecurityFindingSchema).default([]),
  additionalAcceptanceCriteria: z
    .array(
      z.object({
        taskId: z.string(),
        criteria: z.array(z.string()),
      }),
    )
    .default([]),
});

export type SecurityAuditResult = z.infer<typeof SecurityAuditResultSchema>;

export async function auditTasksSecurity(args: {
  tasks: TaskGen[];
  prd?: PrdData | null;
  brd?: PrdData | null; // Kompatibilitas ke belakang
  projectId: string;
}): Promise<SecurityAuditResult> {
  const prdDoc = args.prd ?? args.brd;
  const rules = prdDoc?.productRules?.length ? prdDoc.productRules : prdDoc?.businessRules;
  const system = `Anda adalah Senior Application Security (AppSec) Engineer.
Tugas Anda adalah mengaudit daftar atomic tasks sebelum dieksekusi oleh AI coding agent.
Tinjau seluruh task untuk mendeteksi potensi celah keamanan berikut:
1. Autentikasi & Session: apakah endpoint sensitif terlindungi middleware auth?
2. Otorisasi (IDOR): apakah query database membatasi data berdasarkan userId pemilik data?
3. Rahasia/Credentials: larangan mutlak fallback default pada secret (misal JWT_SECRET || 'secret').
4. Validasi & Sanitasi: apakah setiap request mutasi divalidasi skema Zod?
5. Proteksi Brute-force & Rate Limiting: apakah endpoint login/register memiliki proteksi rate limiting?
6. Integritas Relasi: apakah endpoint DELETE menolak penghapusan record berelasi aktif (HTTP 409)?
7. Kebocoran Data: larangan mengembalikan password hash atau token internal pada response JSON.

Untuk setiap temuan, masukkan ke array 'findings'.
Untuk setiap task yang perlu diperkuat keamanannya, masukkan kriteria penerimaan tambahan ke 'additionalAcceptanceCriteria'.
Kriteria tambahan HARUS presisi, ringkas, dan dapat diuji (measurable & testable).
Jika seluruh task sudah aman, kembalikan array kosong untuk findings dan additionalAcceptanceCriteria.
Kembalikan HANYA JSON valid sesuai skema.`;

  const taskSummaries = args.tasks.map((t) => ({
    taskId: t.taskId,
    title: t.title,
    layer: t.layer,
    files_to_create: t.files_to_create,
    files_to_modify: t.files_to_modify,
    apiContracts: t.apiContracts,
    consumesApis: t.consumesApis,
    acceptanceCriteria: t.acceptanceCriteria,
  }));

  const user = `DAFTAR ATOMIC TASKS:
${JSON.stringify(taskSummaries, null, 2)}

ATURAN PRODUK PRD & NON-FUNCTIONAL:
Non-Functional: ${JSON.stringify(prdDoc?.nonFunctional ?? [])}
Product Rules: ${JSON.stringify(rules ?? [])}

Format JSON (WAJIB):
{
  "findings": [
    {
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "category": "HARDCODED_SECRET" | "MISSING_AUTH" | "INJECTION_RISK" | "UNPROTECTED_ROUTE" | "MISSING_VALIDATION" | "MISSING_RATE_LIMIT" | "IDOR" | "DATA_LEAK" | "INSECURE_DEPENDENCY",
      "taskId": "TASK-001",
      "description": "Deskripsi celah spesifik",
      "recommendation": "Rekomendasi fix teknis"
    }
  ],
  "additionalAcceptanceCriteria": [
    {
      "taskId": "TASK-001",
      "criteria": [
        "Keamanan: Validasi bahwa JWT_SECRET diambil dari process.env tanpa fallback default",
        "Keamanan: Endpoint memverifikasi session token sebelum membaca data"
      ]
    }
  ]
}`;

  return generateJson({
    system,
    user,
    schema: SecurityAuditResultSchema,
    agentName: 'SecurityAuditor',
    promptVersion: PROMPT_VERSIONS.securityAudit,
    projectId: args.projectId,
    maxRetries: 2,
  });
}
