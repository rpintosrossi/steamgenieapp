-- AlterTable
ALTER TABLE "quotes" ADD COLUMN "internalNotes" VARCHAR(2000);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_payments" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "paymentMethodId" UUID NOT NULL,
    "isPending" BOOLEAN NOT NULL DEFAULT false,
    "percent" DECIMAL(5,2),
    "note" VARCHAR(300),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_methods_deletedAt_sortOrder_idx" ON "payment_methods"("deletedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "quote_payments_quoteId_sortOrder_idx" ON "quote_payments"("quoteId", "sortOrder");

-- CreateIndex
CREATE INDEX "quote_payments_paymentMethodId_idx" ON "quote_payments"("paymentMethodId");

-- AddForeignKey
ALTER TABLE "quote_payments" ADD CONSTRAINT "quote_payments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_payments" ADD CONSTRAINT "quote_payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed medios de pago iniciales
INSERT INTO "payment_methods" ("id", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Efectivo', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Transferencia', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Tarjeta', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Mercado Pago', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
