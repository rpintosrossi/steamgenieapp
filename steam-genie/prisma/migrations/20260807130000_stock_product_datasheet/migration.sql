-- AlterTable
ALTER TABLE "stock_products" ADD COLUMN "datasheetStorageKey" VARCHAR(500);
ALTER TABLE "stock_products" ADD COLUMN "datasheetFileName" VARCHAR(255);
ALTER TABLE "stock_products" ADD COLUMN "datasheetMimeType" VARCHAR(120);
