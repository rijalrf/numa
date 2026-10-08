// Security Audit untuk generated tasks: audit AppSec pra-implementasi yang menghasilkan temuan untuk laporan validasi.
// Berjalan di background (job security_audit) dan tidak mengubah task; kriteria keamanan baseline disuntikkan
// secara deterministik oleh security-baseline.ts.
import { z } from 'zod';
import { generateJson } from './ai-service.js';
import type { TaskGen } from './tasks.js';
import type { PrdData } from './prd.js';
import { PROMPT_VERSIONS } from './prompts.js';
import type { Finding } from './validation-report.js';

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
});

export type SecurityAuditResult = z.infer<typeof SecurityAuditResultSchema>;

/** Bagian task yang dibaca audit; cukup untuk task dari AI maupun yang dimuat dari database. */
export type AuditableTask = Pick<
  TaskGen,
  'taskId' | 'title' | 'layer' | 'files_to_create' | 'files_to_modify' | 'apiContracts' | 'consumesApis' | 'acceptanceCriteria'
>;

const SECURITY_SEVERITY: Record<SecurityFinding['severity'], Finding['severity']> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'info',
};

/** Ubah temuan audit menjadi temuan laporan validasi. */
export function toReportFindings(findings: SecurityFinding[]): Finding[] {
  return findings.map((f) => ({
    code: `SEC_${f.category}`,
    severity: SECURITY_SEVERITY[f.severity] ?? 'warning',
    message: `[${f.taskId}] ${f.description} Rekomendasi: ${f.recommendation}`,
    refs: [f.taskId],
  }));
}

export async function auditTasksSecurity(args: {
  tasks: AuditableTask[];
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

Task sudah memuat kriteria keamanan baseline (prefiks "Keamanan:"); laporkan HANYA celah spesifik yang belum tercakup oleh kriteria itu.
Untuk setiap temuan, masukkan ke array 'findings' dengan rekomendasi perbaikan yang presisi dan ringkas.
Jika seluruh task sudah aman, kembalikan array kosong untuk findings.
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
