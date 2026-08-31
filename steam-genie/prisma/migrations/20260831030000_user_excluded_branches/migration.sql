-- Sucursales excluidas por usuario
CREATE TABLE "user_excluded_branches" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_excluded_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_excluded_branches_userId_branchId_key" ON "user_excluded_branches"("userId", "branchId");
CREATE INDEX "user_excluded_branches_userId_idx" ON "user_excluded_branches"("userId");
CREATE INDEX "user_excluded_branches_branchId_idx" ON "user_excluded_branches"("branchId");

ALTER TABLE "user_excluded_branches" ADD CONSTRAINT "user_excluded_branches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_excluded_branches" ADD CONSTRAINT "user_excluded_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "quote_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cada edificio pertenece a una sucursal
ALTER TABLE "buildings" ADD COLUMN "branchId" UUID;

UPDATE "buildings" AS b
SET "branchId" = pc."branchId"
FROM "particular_clients" AS pc
WHERE pc."buildingId" = b.id
  AND pc."deletedAt" IS NULL
  AND b."branchId" IS NULL;

UPDATE "buildings"
SET "branchId" = (
  SELECT id FROM "quote_branches"
  WHERE "deletedAt" IS NULL AND "isDefault" = true
  ORDER BY "sortOrder" ASC
  LIMIT 1
)
WHERE "branchId" IS NULL;

UPDATE "buildings"
SET "branchId" = (
  SELECT id FROM "quote_branches"
  WHERE "deletedAt" IS NULL
  ORDER BY "sortOrder" ASC, "name" ASC
  LIMIT 1
)
WHERE "branchId" IS NULL;

ALTER TABLE "buildings" ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX "buildings_branchId_idx" ON "buildings"("branchId");

ALTER TABLE "buildings" ADD CONSTRAINT "buildings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "quote_branches"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
