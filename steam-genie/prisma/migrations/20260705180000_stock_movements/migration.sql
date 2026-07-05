-- CreateEnum
CREATE TYPE "StockMovementScope" AS ENUM ('DEPOT', 'BUILDING');
CREATE TYPE "StockMovementType" AS ENUM (
  'DEPOT_INITIAL',
  'DEPOT_ADJUST',
  'DEPOT_SET',
  'DEPOT_RESERVE',
  'DEPOT_RESERVE_RELEASE',
  'DEPOT_SHIP_OUT',
  'BUILDING_SET',
  'BUILDING_RECEIVE'
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "scope" "StockMovementScope" NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "productId" UUID NOT NULL,
    "buildingId" UUID,
    "quantityBefore" DECIMAL(12,3) NOT NULL,
    "quantityDelta" DECIMAL(12,3) NOT NULL,
    "quantityAfter" DECIMAL(12,3) NOT NULL,
    "reservedBefore" DECIMAL(12,3),
    "reservedDelta" DECIMAL(12,3),
    "reservedAfter" DECIMAL(12,3),
    "shipmentOrderId" UUID,
    "shipmentDestinationId" UUID,
    "shipmentLineId" UUID,
    "note" TEXT,
    "performedById" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_productId_occurredAt_idx" ON "stock_movements"("productId", "occurredAt");
CREATE INDEX "stock_movements_buildingId_productId_occurredAt_idx" ON "stock_movements"("buildingId", "productId", "occurredAt");
CREATE INDEX "stock_movements_shipmentOrderId_idx" ON "stock_movements"("shipmentOrderId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "stock_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shipmentOrderId_fkey" FOREIGN KEY ("shipmentOrderId") REFERENCES "stock_shipment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shipmentDestinationId_fkey" FOREIGN KEY ("shipmentDestinationId") REFERENCES "stock_shipment_destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "stock_shipment_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
