-- Align checklist task snapshot length with quote item descriptions (5000).
ALTER TABLE "work_order_tasks" ALTER COLUMN "nameSnapshot" SET DATA TYPE VARCHAR(5000);
