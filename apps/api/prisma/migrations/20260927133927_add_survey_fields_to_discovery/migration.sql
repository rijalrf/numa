-- AlterTable
ALTER TABLE "DiscoveryAnswer" ADD COLUMN     "value" JSONB,
ALTER COLUMN "answer" SET DEFAULT '';

-- AlterTable
ALTER TABLE "DiscoveryQuestion" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'radio',
ADD COLUMN     "options" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "suggestion" TEXT,
ADD COLUMN     "suggestionReason" TEXT;
