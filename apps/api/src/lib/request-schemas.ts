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

export const TechStackBodySchema = z.object({
  techStack: z.array(z.string().trim().min(1).max(200)).max(20),
});

/** Permintaan perubahan (Minta Perubahan). Batas panjang per paket dicek terpisah di route. */
export const ChangeRequestBodySchema = z.object({
  request: z.string().trim().min(8, 'Permintaan perubahan minimal 8 karakter').max(4000),
});

/** Jawaban klarifikasi atas permintaan perubahan yang kabur. */
export const ClarifyBodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(100),
        answer: z.string().trim().min(1, 'Jawaban klarifikasi tidak boleh kosong').max(500),
      })
    )
    .min(1)
    .max(10),
});

/** Konfirmasi perancangan task siklus; `split` memilih mengerjakan utuh atau bagian A/B dari usulan pemecahan. */
export const CycleGenerateBodySchema = z.object({
  confirm: z.boolean(),
  split: z.enum(['single', 'a', 'b']).default('single'),
  title: z.string().trim().min(1).max(120).optional(),
});

