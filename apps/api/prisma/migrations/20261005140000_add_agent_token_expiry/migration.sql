-- AlterTable
ALTER TABLE "AgentToken" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "allProjects" BOOLEAN NOT NULL DEFAULT false;

-- Token lama tanpa scope adalah token universal.
UPDATE "AgentToken" t SET "allProjects" = true
WHERE NOT EXISTS (SELECT 1 FROM "AgentTokenScope" s WHERE s."tokenId" = t."id");
