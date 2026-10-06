// Skema Zod untuk body request route yang sebelumnya membaca req.body tanpa validasi.
// Pelanggaran dilempar sebagai ZodError dan diubah menjadi HTTP 400 oleh error handler global.
import { z } from 'zod';

/** Batas ukuran JSON bebas (dalam karakter hasil serialisasi) agar body kecil tidak menyimpan payload besar. */
function maxJsonSize(limit: number) {
  return (value: unknown) => {
    try {
      return JSON.stringify(value).length <= limit;
    } catch {
      return false;
    }
  };
}

export const CompleteTaskBodySchema = z
  .object({
    outputSummary: z.string().max(20_000).optional(),
    apiContracts: z.array(z.unknown()).max(100).refine(maxJsonSize(100_000), 'apiContracts terlalu besar').optional(),
    forced: z.boolean().optional(),
    guardReport: z.unknown().refine(maxJsonSize(100_000), 'guardReport terlalu besar').optional(),
  })
  .passthrough();

export const FailTaskBodySchema = z
  .object({
    failure_type: z.enum(['FORBIDDEN_FILES', 'TEST_FAILURE', 'COMMAND_FAILURE', 'RUNTIME_ERROR']).optional(),
    command: z.string().max(1000).optional(),
    error: z.string().max(10_000).optional(),
    next_action: z.string().max(2000).optional(),
    affected_files: z.array(z.string().max(500)).max(200).optional(),
  })
  .passthrough();

export const BlockTaskBodySchema = z.object({
  reason: z.string().trim().min(1, 'Alasan (reason) wajib diisi.').max(2000),
});

export const RepoSummaryBodySchema = z.object({
  summary: z.unknown().refine((v) => v !== undefined && v !== null && v !== '', 'Ringkasan repo (summary) diperlukan.').refine(maxJsonSize(200_000), 'Ringkasan repo terlalu besar.'),
});

export const CreateTokenBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    expiresInDays: z.coerce.number().finite().optional(),
  })
  .partial();

export const TechStackBodySchema = z.object({
  techStack: z.array(z.string().trim().min(1).max(200)).max(20),
});
