-- AiCallLog: atribusi tenant dan log tetap ada setelah project dihapus
ALTER TABLE "AiCallLog" ADD COLUMN "userId" TEXT, ADD COLUMN "orgId" TEXT;

UPDATE "AiCallLog" l
SET "userId" = p."userId", "orgId" = p."orgId"
FROM "Project" p
WHERE l."projectId" = p."id";

ALTER TABLE "AiCallLog" DROP CONSTRAINT "AiCallLog_projectId_fkey";
ALTER TABLE "AiCallLog" ADD CONSTRAINT "AiCallLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AiCallLog_userId_createdAt_idx" ON "AiCallLog"("userId", "createdAt");

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "orgId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
