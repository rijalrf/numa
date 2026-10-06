// Snapshot versi lama artefak sebelum ditimpa, supaya generate ulang tidak menghilangkan riwayat.
import { logger, serializeError } from './logger.js';
import { prisma } from './prisma.js';

export type ArtifactKind = 'prd' | 'business_flow';

/** Simpan konten artefak saat ini (bila ada). Gagal menyimpan tidak boleh menggagalkan aksi utama. */
export async function snapshotArtifact(projectId: string, kind: ArtifactKind, reason: string): Promise<void> {
  try {
    const current =
      kind === 'prd'
        ? await prisma.prd.findUnique({ where: { projectId }, select: { content: true, version: true } })
        : await prisma.businessFlow.findUnique({ where: { projectId }, select: { content: true, version: true } });
    if (!current) return;
    await prisma.artifactVersion.create({
      data: { projectId, kind, version: current.version, content: current.content as any, reason },
    });
  } catch (err) {
    logger.error('Gagal membuat snapshot artefak', { scope: 'artifact-version', kind, error: serializeError(err) });
  }
}
