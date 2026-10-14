-- Personas opcionales por tarea rutinaria.
-- Sin filas, la tarea la ve todo el equipo del edificio.

CREATE TABLE "task_assignees" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_assignees_taskId_userId_key" ON "task_assignees"("taskId", "userId");

CREATE INDEX "task_assignees_userId_idx" ON "task_assignees"("userId");

ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
