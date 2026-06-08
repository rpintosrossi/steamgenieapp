-- Make Task.startDate required (NOT NULL)
-- Backfill any existing NULLs before applying the constraint

UPDATE "tasks"
SET "startDate" = CURRENT_DATE
WHERE "startDate" IS NULL;

ALTER TABLE "tasks"
ALTER COLUMN "startDate" SET NOT NULL;
