-- CreateEnum
CREATE TYPE "StockUnitType" AS ENUM ('UNIT', 'LITER', 'KILOGRAM', 'GRAM', 'MILLILITER', 'PACK', 'BOX', 'BOTTLE', 'ROLL', 'OTHER');

-- CreateTable
CREATE TABLE "stock_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contactEmail" VARCHAR(200),
    "contactPhone" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_products" (
    "id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "sku" VARCHAR(100),
    "description" VARCHAR(500),
    "categoryId" UUID NOT NULL,
    "supplierId" UUID,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL(12,3) NOT NULL DEFAULT 5,
    "unitType" "StockUnitType" NOT NULL DEFAULT 'UNIT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "stockUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_categories_deletedAt_sortOrder_idx" ON "stock_categories"("deletedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "stock_suppliers_deletedAt_idx" ON "stock_suppliers"("deletedAt");

-- CreateIndex
CREATE INDEX "stock_products_categoryId_deletedAt_idx" ON "stock_products"("categoryId", "deletedAt");

-- CreateIndex
CREATE INDEX "stock_products_supplierId_idx" ON "stock_products"("supplierId");

-- AddForeignKey
ALTER TABLE "stock_products" ADD CONSTRAINT "stock_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "stock_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_products" ADD CONSTRAINT "stock_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "stock_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
