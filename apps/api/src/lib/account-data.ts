// Ekspor dan penghapusan data akun (hak akses dan hak penghapusan data pribadi).
import { prisma } from './prisma.js';

/** Semua data milik akun dalam satu dokumen JSON. Hash token dan sesi login sengaja tidak disertakan. */
export async function buildAccountExport(userId: string) {
  const [user, subscription, payments, agentTokens, projects, chatSessions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, emailVerified: true, image: true,
        codingExperience: true, referralSource: true, referralDetail: true,
        onboardingCompletedAt: true, createdAt: true,
      },
    }),
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.agentToken.findMany({
      where: { userId },
      select: { id: true, name: true, allProjects: true, isRevoked: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    }),
    prisma.project.findMany({
      where: { userId },
      include: {
        stacks: true,
        questions: { include: { answers: true } },
        prd: true,
        businessFlow: true,
        roadmap: { include: { features: true } },
        tasks: true,
        cycles: true,
        treeNodes: true,
        artifactVersions: true,
      },
    }),
    prisma.chatSession.findMany({ where: { userId }, include: { messages: true } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    format: 'numa-account-export/1',
    user,
    subscription,
    payments,
    agentTokens,
    projects,
    chatSessions,
  };
}

/**
 * Hapus akun dan seluruh data pribadinya (project ikut terhapus lewat cascade user).
 * Log audit tidak dihapus (hanya memuat id, tanpa email) demi jejak keamanan.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.aiCallLog.deleteMany({ where: { userId } });
      await tx.aiJob.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    },
    { timeout: 60000 }
  );
}
