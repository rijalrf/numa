// Ekspor dan penghapusan data akun (hak akses dan hak penghapusan data pribadi).
import { prisma } from './prisma.js';

/** Semua data milik akun dalam satu dokumen JSON. Hash token dan sesi login sengaja tidak disertakan. */
export async function buildAccountExport(userId: string) {
  const [user, subscription, payments, memberships, agentTokens, projects, chatSessions] = await Promise.all([
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
    prisma.membership.findMany({
      where: { userId },
      include: { org: { select: { id: true, name: true, slug: true } } },
    }),
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
    memberships: memberships.map((m) => ({ role: m.role, joinedAt: m.createdAt, org: m.org })),
    agentTokens,
    projects,
    chatSessions,
  };
}

export type DeletionBlocker = {
  code: 'sole_owner_with_members';
  orgId: string;
  orgName: string;
};

/** Organisasi yang masih punya anggota lain tetapi akun ini satu-satunya owner. Harus dialihkan dulu. */
export async function findDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const owned = await prisma.membership.findMany({
    where: { userId, role: 'owner' },
    include: { org: { include: { members: { select: { userId: true, role: true } } } } },
  });
  const blockers: DeletionBlocker[] = [];
  for (const m of owned) {
    const others = m.org.members.filter((x) => x.userId !== userId);
    const otherOwners = others.filter((x) => x.role === 'owner');
    if (others.length > 0 && otherOwners.length === 0) {
      blockers.push({ code: 'sole_owner_with_members', orgId: m.org.id, orgName: m.org.name });
    }
  }
  return blockers;
}

/**
 * Hapus akun dan seluruh data pribadinya. Project milik akun ini di organisasi yang masih aktif
 * dialihkan ke owner lain (tidak ikut terhapus). Organisasi yang tidak punya anggota lain ikut dihapus.
 * Log audit tidak dihapus (hanya memuat id, tanpa email) demi jejak keamanan.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const memberships = await tx.membership.findMany({
        where: { userId },
        include: { org: { include: { members: { orderBy: { createdAt: 'asc' } } } } },
      });

      for (const m of memberships) {
        const others = m.org.members.filter((x) => x.userId !== userId);
        if (others.length === 0) {
          // Project org yang dibuat orang lain tidak ada (tidak ada anggota lain); org kosong dihapus,
          // project milik user ikut terhapus lewat cascade user.
          await tx.organization.delete({ where: { id: m.orgId } });
          continue;
        }
        const heir = others.find((x) => x.role === 'owner') ?? others.find((x) => x.role === 'admin') ?? others[0];
        await tx.project.updateMany({ where: { orgId: m.orgId, userId }, data: { userId: heir.userId } });
      }

      await tx.aiCallLog.deleteMany({ where: { userId } });
      await tx.aiJob.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    },
    { timeout: 60000 }
  );
}
