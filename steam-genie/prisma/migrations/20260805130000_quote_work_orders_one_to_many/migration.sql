-- Quote 1:N WorkOrder: move FK from quotes.workOrderId to work_orders.quoteId

ALTER TABLE "work_orders" ADD COLUMN "quoteId" UUID;

-- Backfill existing 1:1 links
UPDATE "work_orders" wo
SET "quoteId" = q."id"
FROM "quotes" q
WHERE q."workOrderId" = wo."id";

ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_workOrderId_fkey";
DROP INDEX IF EXISTS "quotes_workOrderId_key";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "workOrderId";

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "quotes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "work_orders_quoteId_idx" ON "work_orders"("quoteId");
