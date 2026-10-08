-- Hapus fitur organisasi: tabel Membership dan Organization, serta kolom orgId pada Project, AiCallLog, dan AuditLog.
-- Project dengan orgId tetap milik pembuatnya (Project.userId); anggota lain kehilangan akses. Tidak dapat dibalik tanpa backup.

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_orgId_fkey";

-- DropIndex
DROP INDEX "AuditLog_orgId_createdAt_idx";

-- DropIndex
DROP INDEX "Project_orgId_idx";

-- AlterTable
ALTER TABLE "AiCallLog" DROP COLUMN "orgId";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "orgId";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "orgId";

-- DropTable
DROP TABLE "Membership";

-- DropTable
DROP TABLE "Organization";

