-- AlterTable
ALTER TABLE "quotes" ADD COLUMN "contactPhone" VARCHAR(50);
ALTER TABLE "quotes" ADD COLUMN "contactEmail" VARCHAR(200);

-- Backfill from particular clients when available
UPDATE "quotes" q
SET
  "contactPhone" = pc.phone,
  "contactEmail" = pc.email
FROM "particular_clients" pc
WHERE q."particularClientId" = pc.id
  AND q."deletedAt" IS NULL;
