-- Rename table Brd to Prd (preserves existing rows and IDs)
ALTER TABLE "Brd" RENAME TO "Prd";

-- Rename primary key constraint
ALTER TABLE "Prd" RENAME CONSTRAINT "Brd_pkey" TO "Prd_pkey";

-- Rename unique index
ALTER INDEX "Brd_projectId_key" RENAME TO "Prd_projectId_key";

-- Recreate foreign key constraint with new table name
ALTER TABLE "Prd" DROP CONSTRAINT "Brd_projectId_fkey";
ALTER TABLE "Prd" ADD CONSTRAINT "Prd_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing wizardStep value from 'brd' to 'prd'
UPDATE "Project" SET "wizardStep" = 'prd' WHERE "wizardStep" = 'brd';
