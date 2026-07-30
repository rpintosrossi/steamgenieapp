-- Multi-depósito: warehouses + saldos; migrar stock actual a "Sucursal Buenos Aires".

CREATE TYPE "StockWarehouseType" AS ENUM ('COMPANY', 'CLIENT');

CREATE TABLE "stock_warehouses" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "StockWarehouseType" NOT NULL DEFAULT 'COMPANY',
    "buildingId" UUID,
    "notes" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL(12,3) NOT NULL DEFAULT 5,
    "stockUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_warehouses_deletedAt_name_idx" ON "stock_warehouses"("deletedAt", "name");
CREATE INDEX "stock_warehouses_buildingId_idx" ON "stock_warehouses"("buildingId");

CREATE UNIQUE INDEX "stock_balances_warehouseId_productId_key" ON "stock_balances"("warehouseId", "productId");
CREATE INDEX "stock_balances_productId_idx" ON "stock_balances"("productId");

ALTER TABLE "stock_warehouses"
  ADD CONSTRAINT "stock_warehouses_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "buildings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "stock_warehouses"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "stock_products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Depósito inicial con todo el stock actual
INSERT INTO "stock_warehouses" ("id", "name", "type", "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Sucursal Buenos Aires',
  'COMPANY',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "stock_balances" (
  "id",
  "warehouseId",
  "productId",
  "quantity",
  "reservedQuantity",
  "minQuantity",
  "stockUpdatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  w."id",
  p."id",
  p."quantity",
  p."reservedQuantity",
  p."minQuantity",
  p."stockUpdatedAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "stock_products" p
CROSS JOIN "stock_warehouses" w
WHERE w."name" = 'Sucursal Buenos Aires'
  AND w."deletedAt" IS NULL;

-- Movimientos: asociar depósitos históricos al warehouse migrado
ALTER TABLE "stock_movements" ADD COLUMN "warehouseId" UUID;

UPDATE "stock_movements" m
SET "warehouseId" = w."id"
FROM "stock_warehouses" w
WHERE w."name" = 'Sucursal Buenos Aires'
  AND w."deletedAt" IS NULL
  AND m."scope" = 'DEPOT';

CREATE INDEX "stock_movements_warehouseId_productId_occurredAt_idx"
  ON "stock_movements"("warehouseId", "productId", "occurredAt");

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "stock_warehouses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Órdenes de envío: origen = Sucursal Buenos Aires
ALTER TABLE "stock_shipment_orders" ADD COLUMN "sourceWarehouseId" UUID;

UPDATE "stock_shipment_orders" o
SET "sourceWarehouseId" = w."id"
FROM "stock_warehouses" w
WHERE w."name" = 'Sucursal Buenos Aires'
  AND w."deletedAt" IS NULL;

ALTER TABLE "stock_shipment_orders"
  ALTER COLUMN "sourceWarehouseId" SET NOT NULL;

CREATE INDEX "stock_shipment_orders_sourceWarehouseId_idx"
  ON "stock_shipment_orders"("sourceWarehouseId");

ALTER TABLE "stock_shipment_orders"
  ADD CONSTRAINT "stock_shipment_orders_sourceWarehouseId_fkey"
  FOREIGN KEY ("sourceWarehouseId") REFERENCES "stock_warehouses"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cantidades salen del producto (viven en stock_balances)
ALTER TABLE "stock_products" DROP COLUMN "quantity";
ALTER TABLE "stock_products" DROP COLUMN "reservedQuantity";
ALTER TABLE "stock_products" DROP COLUMN "minQuantity";
ALTER TABLE "stock_products" DROP COLUMN "stockUpdatedAt";
