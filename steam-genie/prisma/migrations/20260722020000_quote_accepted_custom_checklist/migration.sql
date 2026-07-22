-- QUOTE_ACCEPTED status for quote-sourced eventual-client services.
-- Custom checklist tasks may omit master taskId.

ALTER TYPE "WorkOrderStatus" ADD VALUE 'QUOTE_ACCEPTED';

ALTER TABLE "work_order_tasks"
  ALTER COLUMN "taskId" DROP NOT NULL;
