-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "allowsPhoto" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: tareas que ya requerían foto también permiten adjuntar.
UPDATE "tasks" SET "allowsPhoto" = true WHERE "requiresPhoto" = true;

-- AlterTable
ALTER TABLE "work_order_tasks" ADD COLUMN "allowsPhotoSnapshot" BOOLEAN NOT NULL DEFAULT false;

UPDATE "work_order_tasks" SET "allowsPhotoSnapshot" = true WHERE "requiresPhotoSnapshot" = true;
