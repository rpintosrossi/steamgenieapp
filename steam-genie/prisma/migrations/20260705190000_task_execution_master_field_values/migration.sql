-- Allow periodic task executions to store custom field values against master fields.
ALTER TABLE "task_execution_field_values" ALTER COLUMN "snapshotFieldId" DROP NOT NULL;

ALTER TABLE "task_execution_field_values" ADD COLUMN "masterFieldId" UUID;

ALTER TABLE "task_execution_field_values"
  ADD CONSTRAINT "task_execution_field_values_masterFieldId_fkey"
  FOREIGN KEY ("masterFieldId") REFERENCES "task_custom_fields"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
