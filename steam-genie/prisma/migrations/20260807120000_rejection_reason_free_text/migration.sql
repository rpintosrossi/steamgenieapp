-- AlterTable
ALTER TABLE "rejection_reasons" ADD COLUMN "allowsFreeText" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "task_executions" ADD COLUMN "rejectionNote" VARCHAR(500);
