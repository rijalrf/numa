-- AlterTable
ALTER TABLE "User" ADD COLUMN     "codingExperience" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "referralDetail" TEXT,
ADD COLUMN     "referralSource" TEXT;

-- Backfill user lama agar tidak perlu onboarding
UPDATE "User" SET "onboardingCompletedAt" = NOW();

