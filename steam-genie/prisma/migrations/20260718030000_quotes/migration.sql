-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('COTIZADO', 'EN_ESPERA', 'ACEPTADO', 'RECHAZADO', 'TERMINADO');

-- CreateTable
CREATE TABLE "quote_counters" (
    "id" VARCHAR(20) NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "quote_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'COTIZADO',
    "particularClientId" UUID,
    "buildingId" UUID,
    "requestDate" DATE NOT NULL,
    "serviceType" VARCHAR(500),
    "clientDetails" VARCHAR(2000),
    "sellerName" VARCHAR(200),
    "paymentCondition" VARCHAR(100),
    "paymentTerms" VARCHAR(500),
    "observations" VARCHAR(1000),
    "validUntil" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "workOrderId" UUID,
    "createdById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");
CREATE UNIQUE INDEX "quotes_workOrderId_key" ON "quotes"("workOrderId");
CREATE INDEX "quotes_status_requestDate_idx" ON "quotes"("status", "requestDate");
CREATE INDEX "quotes_particularClientId_idx" ON "quotes"("particularClientId");
CREATE INDEX "quotes_buildingId_idx" ON "quotes"("buildingId");
CREATE INDEX "quotes_deletedAt_requestDate_idx" ON "quotes"("deletedAt", "requestDate");
CREATE INDEX "quote_items_quoteId_sortOrder_idx" ON "quote_items"("quoteId", "sortOrder");

-- FKs
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_particularClientId_fkey" FOREIGN KEY ("particularClientId") REFERENCES "particular_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed counter (continúa desde el modelo del cliente ~2943)
INSERT INTO "quote_counters" ("id", "nextNumber") VALUES ('default', 2944);

-- Permissions
INSERT INTO "role_permissions" ("id", "roleId", "moduleKey")
SELECT gen_random_uuid(), r."id", 'presupuestos'
FROM "roles" r
WHERE r."name" IN ('admin', 'manager')
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" rp
    WHERE rp."roleId" = r."id" AND rp."moduleKey" = 'presupuestos'
  );
