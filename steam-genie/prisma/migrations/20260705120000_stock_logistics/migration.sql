-- CreateEnum
CREATE TYPE "StockShipmentOrderStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
CREATE TYPE "StockShipmentDestinationStatus" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');
CREATE TYPE "StockShipmentLineStatus" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');
CREATE TYPE "BuildingStockAlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'OBSERVATION');
CREATE TYPE "BuildingStockAlertStatus" AS ENUM ('OPEN', 'IN_TRANSIT', 'RESOLVED');

-- AlterTable
ALTER TABLE "stock_products" ADD COLUMN "reservedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "building_stock_items" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_stock_alerts" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "reportedById" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "alertType" "BuildingStockAlertType" NOT NULL,
    "note" TEXT,
    "photoStorageKey" VARCHAR(500),
    "photoStorageBucket" VARCHAR(100) DEFAULT 'local',
    "status" "BuildingStockAlertStatus" NOT NULL DEFAULT 'OPEN',
    "shipmentDestinationId" UUID,
    "deliveryDate" DATE,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_shipment_orders" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "status" "StockShipmentOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "dispatchedById" UUID,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_shipment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_shipment_destinations" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "deliveryDate" DATE,
    "status" "StockShipmentDestinationStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "confirmedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_shipment_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_shipment_lines" (
    "id" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" "StockShipmentLineStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_shipment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "building_stock_items_buildingId_productId_key" ON "building_stock_items"("buildingId", "productId");
CREATE INDEX "building_stock_items_buildingId_idx" ON "building_stock_items"("buildingId");
CREATE INDEX "building_stock_alerts_buildingId_status_idx" ON "building_stock_alerts"("buildingId", "status");
CREATE INDEX "building_stock_alerts_productId_buildingId_status_idx" ON "building_stock_alerts"("productId", "buildingId", "status");
CREATE UNIQUE INDEX "stock_shipment_orders_reference_key" ON "stock_shipment_orders"("reference");
CREATE INDEX "stock_shipment_orders_status_createdAt_idx" ON "stock_shipment_orders"("status", "createdAt");
CREATE UNIQUE INDEX "stock_shipment_destinations_orderId_buildingId_key" ON "stock_shipment_destinations"("orderId", "buildingId");
CREATE INDEX "stock_shipment_destinations_buildingId_status_idx" ON "stock_shipment_destinations"("buildingId", "status");
CREATE INDEX "stock_shipment_lines_destinationId_idx" ON "stock_shipment_lines"("destinationId");

-- AddForeignKey
ALTER TABLE "building_stock_items" ADD CONSTRAINT "building_stock_items_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "building_stock_items" ADD CONSTRAINT "building_stock_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "stock_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "building_stock_alerts" ADD CONSTRAINT "building_stock_alerts_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "building_stock_alerts" ADD CONSTRAINT "building_stock_alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "stock_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "building_stock_alerts" ADD CONSTRAINT "building_stock_alerts_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "building_stock_alerts" ADD CONSTRAINT "building_stock_alerts_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "building_stock_alerts" ADD CONSTRAINT "building_stock_alerts_shipmentDestinationId_fkey" FOREIGN KEY ("shipmentDestinationId") REFERENCES "stock_shipment_destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_shipment_orders" ADD CONSTRAINT "stock_shipment_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_shipment_orders" ADD CONSTRAINT "stock_shipment_orders_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_shipment_destinations" ADD CONSTRAINT "stock_shipment_destinations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "stock_shipment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_shipment_destinations" ADD CONSTRAINT "stock_shipment_destinations_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_shipment_destinations" ADD CONSTRAINT "stock_shipment_destinations_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_shipment_lines" ADD CONSTRAINT "stock_shipment_lines_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "stock_shipment_destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_shipment_lines" ADD CONSTRAINT "stock_shipment_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "stock_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
