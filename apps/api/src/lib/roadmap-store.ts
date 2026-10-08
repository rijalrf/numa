// Penyimpanan roadmap project secara atomik (phase, feature, dependency dalam satu transaksi).
import { prisma } from './prisma.js';
import type { RoadmapData } from './ai/roadmap.js';

/**
 * Ganti seluruh roadmap project. Bila ada langkah yang gagal, roadmap lama tetap utuh (tidak ada roadmap setengah jadi).
 * Mengembalikan peta id fitur AI (slug) ke id fitur di database.
 */
export async function saveRoadmap(projectId: string, data: RoadmapData): Promise<Map<string, string>> {
  return prisma.$transaction(
    async (tx) => {
      await tx.roadmapPhase.deleteMany({ where: { projectId } });

      const featureIds = new Map<string, string>(); // slug AI -> id database
      for (const p of data.phases) {
        const phase = await tx.roadmapPhase.create({
          data: { projectId, order: p.order, title: p.title, description: p.description, layer: p.layer },
        });
        for (const f of p.features) {
          const feature = await tx.roadmapFeature.create({
            data: { phaseId: phase.id, title: f.title, description: f.description },
          });
          featureIds.set(f.id, feature.id);
        }
      }

      const dependencies: Array<{ featureId: string; dependsOnId: string }> = [];
      const seen = new Set<string>();
      for (const p of data.phases) {
        for (const f of p.features) {
          const featureId = featureIds.get(f.id);
          if (!featureId) continue;
          for (const dep of f.dependsOn) {
            const dependsOnId = featureIds.get(dep);
            const key = `${featureId}>${dependsOnId}`;
            if (dependsOnId && dependsOnId !== featureId && !seen.has(key)) {
              seen.add(key);
              dependencies.push({ featureId, dependsOnId });
            }
          }
        }
      }
      if (dependencies.length > 0) await tx.roadmapDependency.createMany({ data: dependencies });

      return featureIds;
    },
    { timeout: 60000 },
  );
}
