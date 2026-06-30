-- Admin list / assign performance indexes

CREATE INDEX "users_deletedAt_fullName_idx" ON "users"("deletedAt", "fullName");
CREATE INDEX "buildings_deletedAt_idx" ON "buildings"("deletedAt");
CREATE INDEX "tasks_buildingId_isActive_deletedAt_idx" ON "tasks"("buildingId", "isActive", "deletedAt");
CREATE INDEX "task_executions_periodicTaskInstanceId_idx" ON "task_executions"("periodicTaskInstanceId");
