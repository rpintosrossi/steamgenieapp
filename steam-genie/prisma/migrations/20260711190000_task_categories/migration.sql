-- CreateTable
CREATE TABLE "task_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "categoryId" UUID;

-- CreateIndex
CREATE INDEX "task_categories_deletedAt_sortOrder_idx" ON "task_categories"("deletedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "tasks_categoryId_deletedAt_idx" ON "tasks"("categoryId", "deletedAt");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "task_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
