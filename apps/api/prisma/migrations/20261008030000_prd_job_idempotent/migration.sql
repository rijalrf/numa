-- Perluas penjaga job aktif ganda ke prd_generate dan prd_spec (satu job aktif per project+type).
-- Menggantikan "AiJob_idempotent_active_key".

-- Job prd_generate/prd_spec aktif ganda (jika ada): batalkan yang lebih lama, sisakan yang terbaru.
UPDATE "AiJob" SET "status" = 'cancelled', "error" = 'Digantikan job yang lebih baru.', "finishedAt" = NOW()
WHERE "type" IN ('prd_generate', 'prd_spec')
  AND "status" IN ('queued', 'running')
  AND "id" NOT IN (
    SELECT DISTINCT ON ("projectId", "type") "id" FROM "AiJob"
    WHERE "type" IN ('prd_generate', 'prd_spec') AND "status" IN ('queued', 'running')
    ORDER BY "projectId", "type", "createdAt" DESC, "id" DESC
  );

DROP INDEX "AiJob_idempotent_active_key";

CREATE UNIQUE INDEX "AiJob_idempotent_active_key" ON "AiJob"("projectId", "type")
WHERE "type" IN ('survey_round', 'survey_summary', 'techstack_recommend', 'prd_generate', 'prd_spec')
  AND "status" IN ('queued', 'running');
