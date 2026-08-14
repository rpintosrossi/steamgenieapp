-- AlterTable
ALTER TABLE "particular_clients" ADD COLUMN "branchId" UUID;

UPDATE "particular_clients"
SET "branchId" = (SELECT "id" FROM "quote_branches" WHERE "isDefault" = true AND "deletedAt" IS NULL LIMIT 1)
WHERE "branchId" IS NULL;

UPDATE "particular_clients"
SET "branchId" = (SELECT "id" FROM "quote_branches" WHERE "deletedAt" IS NULL ORDER BY "sortOrder" ASC LIMIT 1)
WHERE "branchId" IS NULL;

ALTER TABLE "particular_clients" ALTER COLUMN "branchId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "particular_clients_branchId_idx" ON "particular_clients"("branchId");

-- AddForeignKey
ALTER TABLE "particular_clients" ADD CONSTRAINT "particular_clients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "quote_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
