// Persist hasil generateTasksFromRoadmap ke database secara atomik.
// Dipakai routes/tasks.ts (generasi awal) dan routes/cycles.ts (siklus perubahan).
import type { TaskGen } from './ai/tasks.js';
import type { UiCheckConfig } from './ai/ui-shell-contract.js';

export async function persistGeneratedTasks(
  tx: any,
  projectId: string,
  validTasks: TaskGen[],
  featureIdMap: Map<string, string>,
  cycleId?: string | null,
  startOrder = 1,
  /** `uiCheck`: konfigurasi pemeriksaan gaya `numa done`, disimpan hanya di task FRONTEND (null = stack tidak didukung). */
  extra: { uiCheck?: UiCheckConfig | null } = {}
) {
  let order = startOrder;
  const createdTasks: Array<{
    dbId: string;
    aiTaskId?: string;
    order: number;
    featureId?: string;
    dependsOn: string[];
  }> = [];

  for (const t of validTasks) {
    let dbFeatureId: string | undefined;
    for (const [dbId, tmpId] of featureIdMap.entries()) {
      if (tmpId === t.featureId || dbId === t.featureId) {
        if (!dbId.startsWith('CYCLE-')) {
          dbFeatureId = dbId;
        }
        break;
      }
    }
    const currentOrder = order++;
    const created = await tx.task.create({
      data: {
        projectId,
        featureId: dbFeatureId,
        cycleId: cycleId ?? null,
        title: t.title,
        description: t.description,
        layer: t.layer,
        status: 'TODO',
        order: currentOrder,
        apiContracts: (t as any).apiContracts ?? [],
        aiContext: {
          taskId: t.taskId,
          requirement_ids: t.requirement_ids,
          depends_on: t.depends_on,
          files_to_create: t.files_to_create,
          files_to_modify: t.files_to_modify,
          files_readonly: t.files_readonly,
          forbidden: t.forbidden,
          implementation_steps: t.implementation_steps,
          validation_commands: t.validation_commands,
          advisory_commands: (t as any).advisory_commands ?? [],
          definition_of_done: t.definition_of_done,
          out_of_scope: t.out_of_scope,
          consumesApis: t.consumesApis ?? [],
          ...(t.layer === 'FRONTEND' && extra.uiCheck ? { uiCheck: extra.uiCheck } : {}),
        },
        acceptanceCriteria: t.acceptanceCriteria,
      },
    });

    createdTasks.push({
      dbId: created.id,
      aiTaskId: t.taskId,
      order: currentOrder,
      featureId: t.featureId,
      dependsOn: t.depends_on ?? [],
    });
  }

  // Hubungkan TaskDependency native di database
  for (const item of createdTasks) {
    if (item.dependsOn.length > 0) {
      for (const dep of item.dependsOn) {
        const cleanDep = dep.trim().toLowerCase();
        const target = createdTasks.find(
          (c) =>
            c.dbId !== item.dbId &&
            ((c.aiTaskId && c.aiTaskId.toLowerCase() === cleanDep) ||
              `task-${c.order}` === cleanDep ||
              String(c.order) === cleanDep ||
              (c.featureId && c.featureId.toLowerCase() === cleanDep))
        );
        if (target) {
          await tx.taskDependency.create({
            data: {
              taskId: item.dbId,
              dependsOnId: target.dbId,
            },
          });
        }
      }
    }
  }

  return createdTasks;
}
