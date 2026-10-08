-- Payment dibuat netral terhadap gateway: midtransId menjadi providerRef, ditambah kolom untuk Mayar.
ALTER TABLE "Payment" RENAME COLUMN "midtransId" TO "providerRef";
ALTER INDEX "Payment_midtransId_key" RENAME TO "Payment_providerRef_key";
DROP INDEX IF EXISTS "Payment_midtransId_idx";
DROP INDEX IF EXISTS "Payment_userId_idx";

-- Baris lama berasal dari Midtrans; baris baru default ke mayar.
ALTER TABLE "Payment" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'midtrans';
ALTER TABLE "Payment" ALTER COLUMN "provider" SET DEFAULT 'mayar';
ALTER TABLE "Payment" ADD COLUMN "providerTxId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Payment_providerTxId_key" ON "Payment"("providerTxId");
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");
