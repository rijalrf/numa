// Laporan quality gate hasil generate artefak. Disimpan ke tabel ValidationReport dan dibaca lewat API.
import { prisma } from '../prisma.js';

export type Finding = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  refs?: string[];
};

export function summarizeFindings(findings: Finding[]) {
  return {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    infos: findings.filter((f) => f.severity === 'info').length,
  };
}

export async function saveValidationReport(projectId: string, kind: string, findings: Finding[]) {
  return prisma.validationReport.create({
    data: { projectId, kind, summary: summarizeFindings(findings), findings: findings as any },
  });
}
