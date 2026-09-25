-- Sinkronisasi schema drift: object berikut sudah ada di schema.prisma sejak 10 Sep 2026
-- tetapi belum pernah dibuatkan file migrasi, sehingga `prisma migrate deploy` di CI
-- tidak pernah membuatnya di DB produksi (menyebabkan P2022 "column does not exist").
--
-- Guard IF NOT EXISTS wajib: DB produksi sudah disinkronkan manual via `prisma db push`,
-- jadi object ini kemungkinan besar sudah ada di sana.

-- AlterTable: Project.uiSpec (spesifikasi desain UI/UX terstruktur)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "uiSpec" JSONB;

-- AlterTable: Task.apiContracts & Task.outputSummary (kontrak API + ringkasan output task)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "apiContracts" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "outputSummary" TEXT;

-- CreateTable: observabilitas pemanggilan AI (token, latensi, retry)
CREATE TABLE IF NOT EXISTS "AiCallLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "agentName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiCallLog_projectId_idx" ON "AiCallLog"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiCallLog_agentName_idx" ON "AiCallLog"("agentName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiCallLog_createdAt_idx" ON "AiCallLog"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AiCallLog_projectId_fkey'
    ) THEN
        ALTER TABLE "AiCallLog" ADD CONSTRAINT "AiCallLog_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
