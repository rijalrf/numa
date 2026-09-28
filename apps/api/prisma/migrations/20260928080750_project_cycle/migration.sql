-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "repoSummary" JSONB;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "cycleId" TEXT;

-- CreateTable
CREATE TABLE "ProjectCycle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "type" TEXT NOT NULL DEFAULT 'MIXED',
    "size" TEXT NOT NULL DEFAULT 'MEDIUM',
    "impact" JSONB NOT NULL DEFAULT '{}',
    "clarify" JSONB NOT NULL DEFAULT '[]',
    "prdDelta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCycle_projectId_status_idx" ON "ProjectCycle"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectCycle_projectId_number_idx" ON "ProjectCycle"("projectId", "number");

-- CreateIndex
CREATE INDEX "Task_cycleId_idx" ON "Task"("cycleId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ProjectCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCycle" ADD CONSTRAINT "ProjectCycle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
