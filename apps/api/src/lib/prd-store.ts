// Penyimpanan PRD: simpan dokumen + maju ke board secara atomik, dan terapkan spec hasil ekstraksi.
import { prisma } from './prisma.js';
import { snapshotArtifact } from './artifact-version.js';
import { readPrdContent } from './ai/prd.js';
import type { ProductSpec } from './ai/product-spec.js';

/**
 * Simpan PRD (buat atau timpa, versi naik) dan majukan wizard ke 'board' dalam satu transaksi.
 * Snapshot versi lama dibuat lebih dulu dan bersifat best-effort (gagal snapshot tidak membatalkan simpan).
 */
export async function savePrd(projectId: string, content: unknown): Promise<{ version: number }> {
  await snapshotArtifact(projectId, 'prd', 'prd_regenerate');
  const json = JSON.parse(JSON.stringify(content));
  const saved = await prisma.$transaction(async (tx) => {
    const prd = await tx.prd.upsert({
      where: { projectId },
      create: { projectId, content: json, version: 1 },
      update: { content: json, version: { increment: 1 } },
    });
    await tx.project.update({ where: { id: projectId }, data: { wizardStep: 'board' } });
    return prd;
  });
  return { version: saved.version };
}

/**
 * Tempelkan spec ke PRD hanya bila PRD masih versi yang diekstrak (`expectedVersion`).
 * Bila PRD sudah dibuat ulang selagi ekstraksi berjalan, spec lama dibuang (false).
 */
export async function applyProductSpec(projectId: string, expectedVersion: number, spec: ProductSpec): Promise<boolean> {
  const row = await prisma.prd.findUnique({ where: { projectId } });
  if (!row || row.version !== expectedVersion) return false;
  const content = { ...readPrdContent(row.content), spec, dataModels: undefined, apiEndpoints: undefined };
  const result = await prisma.prd.updateMany({
    where: { projectId, version: expectedVersion },
    data: { content: JSON.parse(JSON.stringify(content)) },
  });
  return result.count === 1;
}
