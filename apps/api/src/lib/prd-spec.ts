// Menjamin PRD project memiliki ProductSpec. Dipakai route PRD (setelah generate) dan generator task (PRD lama).
import { prisma } from './prisma.js';
import { readPrdContent, type PrdDoc } from './ai/prd.js';
import { extractProductSpec } from './ai/product-spec.js';

export type EnsureSpecResult = { prd: PrdDoc; extracted: boolean; error?: string };

/**
 * Mengembalikan PRD beserta spec. Bila spec belum ada, diekstrak lalu disimpan ke `Prd.content`.
 * Kegagalan ekstraksi tidak dilempar: PRD dikembalikan apa adanya dengan `error` terisi agar pemanggil bisa
 * mencatatnya sebagai peringatan kualitas.
 */
export async function ensureProductSpec(projectId: string): Promise<EnsureSpecResult | null> {
  const row = await prisma.prd.findUnique({ where: { projectId } });
  if (!row) return null;

  const prd = readPrdContent(row.content);
  if (prd.spec) return { prd, extracted: false };

  try {
    const spec = await extractProductSpec({ markdown: prd.markdown, projectId });
    const content = { ...prd, spec, dataModels: undefined, apiEndpoints: undefined };
    await prisma.prd.update({ where: { projectId }, data: { content: JSON.parse(JSON.stringify(content)) } });
    return {
      prd: { ...prd, spec, dataModels: spec.entities, apiEndpoints: spec.endpoints, productRules: prd.productRules ?? spec.rules },
      extracted: true,
    };
  } catch (err) {
    return { prd, extracted: false, error: (err as Error).message };
  }
}
