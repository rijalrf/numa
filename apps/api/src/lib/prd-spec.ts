// Menjamin PRD project memiliki ProductSpec. Dipakai generator task (PRD lama atau spec yang gagal).
import { prisma } from './prisma.js';
import { readPrdContent, type PrdDoc } from './ai/prd.js';
import { extractProductSpec } from './ai/product-spec.js';
import { waitForNoActiveJob } from './ai/job.js';
import { applyProductSpec } from './prd-store.js';

export type EnsureSpecResult = { prd: PrdDoc; extracted: boolean; error?: string };

/**
 * Mengembalikan PRD beserta spec. Bila job `prd_spec` masih berjalan, ditunggu dulu (spec disusun di background
 * setelah PRD disimpan). Bila spec tetap belum ada, diekstrak langsung lalu disimpan ke `Prd.content`.
 * Kegagalan ekstraksi tidak dilempar: PRD dikembalikan apa adanya dengan `error` terisi agar pemanggil bisa
 * mencatatnya sebagai peringatan kualitas.
 */
export async function ensureProductSpec(projectId: string): Promise<EnsureSpecResult | null> {
  await waitForNoActiveJob(projectId, 'prd_spec');

  const row = await prisma.prd.findUnique({ where: { projectId } });
  if (!row) return null;

  const prd = readPrdContent(row.content);
  if (prd.spec) return { prd, extracted: false };

  try {
    const spec = await extractProductSpec({ markdown: prd.markdown, projectId });
    await applyProductSpec(projectId, row.version, spec);
    return {
      prd: { ...prd, spec, dataModels: spec.entities, apiEndpoints: spec.endpoints, productRules: prd.productRules ?? spec.rules },
      extracted: true,
    };
  } catch (err) {
    return { prd, extracted: false, error: (err as Error).message };
  }
}
