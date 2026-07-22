-- High-level building operation mode (SIMPLE | DETAILED).
-- Photo evidence settings live under SIMPLE mode.

CREATE TYPE "BuildingMode" AS ENUM ('SIMPLE', 'DETAILED');

ALTER TABLE "buildings"
  ADD COLUMN "buildingMode" "BuildingMode" NOT NULL DEFAULT 'DETAILED';

-- Buildings already using phase photo evidence become SIMPLE.
UPDATE "buildings"
SET "buildingMode" = 'SIMPLE'
WHERE "photoEvidenceMode" = 'BEFORE_DURING_AFTER';
