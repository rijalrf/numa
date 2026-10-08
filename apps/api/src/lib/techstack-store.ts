// Penyimpanan tech stack project: atomik dan aman terhadap request bersamaan.
import { prisma } from './prisma.js';
import { parseStackEntry } from './ai/stack-contract.js';

/**
 * Ganti seluruh stack project dan pindahkan wizard ke tahap PRD dalam satu transaksi.
 * Baris Project dikunci (FOR UPDATE) agar dua penyimpanan bersamaan berjalan bergantian
 * dan tidak menyisakan stack ganda. Bila ada langkah yang gagal, stack lama tetap utuh.
 */
export async function saveTechStack(projectId: string, stacks: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
    await tx.stack.deleteMany({ where: { projectId } });
    await tx.stack.createMany({
      data: stacks.map((entry) => {
        const parsed = parseStackEntry(entry);
        return { projectId, category: parsed.category, name: parsed.name, version: parsed.version };
      }),
    });
    await tx.project.update({ where: { id: projectId }, data: { wizardStep: 'prd' } });
  });
}
