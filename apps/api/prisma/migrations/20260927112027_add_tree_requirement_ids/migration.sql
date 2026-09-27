-- AlterTable
ALTER TABLE "TreeNode" ADD COLUMN     "requirementIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
