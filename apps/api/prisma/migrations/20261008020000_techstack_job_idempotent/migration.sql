-- Perluas penjaga job aktif ganda: survey_round, survey_summary, dan techstack_recommend
-- (satu job aktif per project+type). Menggantikan "AiJob_survey_active_key".

-- Job techstack_recommend aktif ganda (jika ada): batalkan yang lebih lama, sisakan yang terbaru.
UPDATE "AiJob" SET "status" = 'cancelled', "error" = 'Digantikan job yang lebih baru.', "finishedAt" = NOW()
WHERE "type" = 'techstack_recommend'
  AND "status" IN ('queued', 'running')
  AND "id" NOT IN (
    SELECT DISTINCT ON ("projectId") "id" FROM "AiJob"
    WHERE "type" = 'techstack_recommend' AND "status" IN ('queued', 'running')
    ORDER BY "projectId", "createdAt" DESC, "id" DESC
  );

DROP INDEX "AiJob_survey_active_key";

CREATE UNIQUE INDEX "AiJob_idempotent_active_key" ON "AiJob"("projectId", "type")
WHERE "type" IN ('survey_round', 'survey_summary', 'techstack_recommend') AND "status" IN ('queued', 'running');
