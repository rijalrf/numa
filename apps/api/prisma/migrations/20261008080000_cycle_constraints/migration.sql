-- Jaga integritas siklus perubahan di level DB: nomor siklus unik per project dan hanya satu DRAFT per project.

-- Nomor ganda (jika ada): beri nomor ulang berurutan per project berdasarkan waktu dibuat.
UPDATE "ProjectCycle" c SET "number" = r.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", "id") AS rn
  FROM "ProjectCycle"
) r
WHERE c."id" = r."id" AND c."number" <> r.rn;

-- DRAFT ganda (jika ada): sisakan yang terbaru, hapus sisanya (belum punya task).
DELETE FROM "ProjectCycle"
WHERE "status" = 'DRAFT'
  AND "id" NOT IN (
    SELECT DISTINCT ON ("projectId") "id" FROM "ProjectCycle"
    WHERE "status" = 'DRAFT'
    ORDER BY "projectId", "createdAt" DESC, "id" DESC
  );

DROP INDEX "ProjectCycle_projectId_number_idx";
CREATE UNIQUE INDEX "ProjectCycle_projectId_number_key" ON "ProjectCycle"("projectId", "number");

CREATE UNIQUE INDEX "ProjectCycle_one_draft_key" ON "ProjectCycle"("projectId") WHERE "status" = 'DRAFT';
