// Gate checkpoint human-in-the-loop: selama ada checkpoint PENDING yang memblokir,
// agent (CLI) tidak boleh mengambil atau memulai task baru.
import { prisma } from './prisma.js';

// APPS_READY_FOR_USE hanya verifikasi akhir (informasional) sehingga tidak memblokir task INTEGRATION.
const BLOCKING_TYPES = ['LAYER_TRANSITION', 'PRD_APPROVAL', 'ROADMAP_APPROVAL'];

export async function findBlockingCheckpoint(projectId: string) {
  return prisma.checkpoint.findFirst({
    where: { projectId, status: 'PENDING', type: { in: BLOCKING_TYPES } },
    orderBy: { createdAt: 'asc' },
  });
}

export function checkpointBlockedBody(cp: { id: string; type: string; layer: string | null; message: string | null }) {
  return {
    error:
      'Checkpoint menunggu approval user. Berhenti dan minta user menyetujui checkpoint di papan Numa sebelum melanjutkan.',
    code: 'checkpoint_pending',
    checkpoint: { id: cp.id, type: cp.type, layer: cp.layer, message: cp.message },
  };
}
