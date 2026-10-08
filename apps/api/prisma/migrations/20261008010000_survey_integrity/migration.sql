-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "surveyTotalRounds" INTEGER;

-- Bersihkan pertanyaan ganda (akibat dua job survey_round paralel): sisakan satu per (projectId, round, order).
-- Jawaban pertanyaan yang dihapus ikut terhapus lewat ON DELETE CASCADE.
DELETE FROM "DiscoveryQuestion"
WHERE "id" NOT IN (
  SELECT MIN("id") FROM "DiscoveryQuestion" GROUP BY "projectId", "round", "order"
);

-- Bersihkan jawaban ganda: sisakan yang terbaru per pertanyaan.
DELETE FROM "DiscoveryAnswer"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("questionId") "id" FROM "DiscoveryAnswer" ORDER BY "questionId", "createdAt" DESC, "id" DESC
);

-- DropIndex
DROP INDEX "DiscoveryAnswer_questionId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryQuestion_projectId_round_order_key" ON "DiscoveryQuestion"("projectId", "round", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryAnswer_questionId_key" ON "DiscoveryAnswer"("questionId");

-- Job survey aktif ganda (jika ada): batalkan yang lebih lama, sisakan yang terbaru per (projectId, type).
UPDATE "AiJob" SET "status" = 'cancelled', "error" = 'Digantikan job yang lebih baru.', "finishedAt" = NOW()
WHERE "type" IN ('survey_round', 'survey_summary')
  AND "status" IN ('queued', 'running')
  AND "id" NOT IN (
    SELECT DISTINCT ON ("projectId", "type") "id" FROM "AiJob"
    WHERE "type" IN ('survey_round', 'survey_summary') AND "status" IN ('queued', 'running')
    ORDER BY "projectId", "type", "createdAt" DESC, "id" DESC
  );

-- Satu job survey aktif per (projectId, type): pengaman atomik untuk request generate/submit bersamaan.
CREATE UNIQUE INDEX "AiJob_survey_active_key" ON "AiJob"("projectId", "type")
WHERE "type" IN ('survey_round', 'survey_summary') AND "status" IN ('queued', 'running');
