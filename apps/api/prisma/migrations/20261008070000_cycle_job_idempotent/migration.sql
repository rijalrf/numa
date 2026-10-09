-- Perluas penjaga job aktif ganda ke cycle_analyze dan cycle_generate (satu job aktif per project+type).
-- Menggantikan "AiJob_idempotent_active_key".

-- Job cycle_analyze/cycle_generate aktif ganda (jika ada): batalkan yang lebih lama, sisakan yang terbaru.
UPDATE "AiJob" SET "status" = 'cancelled', "error" = 'Digantikan job yang lebih baru.', "finishedAt" = NOW()
WHERE "type" IN ('cycle_analyze', 'cycle_generate')
  AND "status" IN ('queued', 'running')
  AND "id" NOT IN (
    SELECT DISTINCT ON ("projectId", "type") "id" FROM "AiJob"
    WHERE "type" IN ('cycle_analyze', 'cycle_generate') AND "status" IN ('queued', 'running')
    ORDER BY "projectId", "type", "createdAt" DESC, "id" DESC
  );

DROP INDEX "AiJob_idempotent_active_key";

CREATE UNIQUE INDEX "AiJob_idempotent_active_key" ON "AiJob"("projectId", "type")
WHERE "type" IN ('survey_round', 'survey_summary', 'techstack_recommend', 'prd_generate', 'prd_spec', 'tasks_generate', 'security_audit', 'cycle_analyze', 'cycle_generate')
  AND "status" IN ('queued', 'running');
