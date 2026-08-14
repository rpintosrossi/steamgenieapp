-- CreateTable
CREATE TABLE "quote_branches" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_branches_deletedAt_sortOrder_idx" ON "quote_branches"("deletedAt", "sortOrder");

-- Seed sucursal por defecto (Buenos Aires)
INSERT INTO "quote_branches" ("id", "name", "address", "phone", "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Buenos Aires',
  'REPUBLICA 5549 V BALLESTER',
  '5263-2848',
  true,
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN "branchId" UUID;

UPDATE "quotes"
SET "branchId" = (SELECT "id" FROM "quote_branches" WHERE "isDefault" = true LIMIT 1)
WHERE "branchId" IS NULL;

ALTER TABLE "quotes" ALTER COLUMN "branchId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "quotes_branchId_idx" ON "quotes"("branchId");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "quote_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
