-- Bersihkan node alur proses lama yang sebelumnya disimpan di TreeNode
DELETE FROM "TreeNode" WHERE "kind" IN ('start', 'process', 'decision', 'end');

-- AlterTable
ALTER TABLE "TreeNode" DROP COLUMN "edgeLabel";

-- CreateTable
CREATE TABLE "BusinessFlow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessFlow_projectId_key" ON "BusinessFlow"("projectId");

-- AddForeignKey
ALTER TABLE "BusinessFlow" ADD CONSTRAINT "BusinessFlow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
