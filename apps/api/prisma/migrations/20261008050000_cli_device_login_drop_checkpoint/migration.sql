-- Sistem checkpoint dan approval web dihapus (approval dipindah ke agent koding milik user).
DROP TABLE "Checkpoint";

-- Login CLI lewat browser (device code).
CREATE TABLE "CliAuthRequest" (
    "id" TEXT NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT 'CLI',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CliAuthRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CliAuthRequest_deviceCodeHash_key" ON "CliAuthRequest"("deviceCodeHash");
CREATE UNIQUE INDEX "CliAuthRequest_userCode_key" ON "CliAuthRequest"("userCode");
CREATE INDEX "CliAuthRequest_expiresAt_idx" ON "CliAuthRequest"("expiresAt");
