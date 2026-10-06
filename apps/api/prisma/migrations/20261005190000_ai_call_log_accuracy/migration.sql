-- Kolom akurasi dan versi prompt pada AiCallLog.
ALTER TABLE "AiCallLog" ADD COLUMN "tier" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "promptVersion" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "estimated" BOOLEAN NOT NULL DEFAULT false;
