-- Job yang masih 'running' sebelum migrasi tidak punya payload/handler antrean: tandai gagal.
UPDATE "AiJob"
SET "status" = 'failed',
    "error" = 'Dihentikan saat migrasi antrean job. Silakan jalankan ulang.',
    "finishedAt" = NOW()
WHERE "status" = 'running';

-- AlterTable
ALTER TABLE "AiJob"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ALTER COLUMN "status" SET DEFAULT 'queued';

-- CreateIndex
CREATE INDEX "AiJob_status_runAfter_idx" ON "AiJob"("status", "runAfter");
