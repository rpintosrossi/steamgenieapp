-- Attendance timeline list queries

CREATE INDEX "attendances_deletedAt_checkInAt_idx" ON "attendances"("deletedAt", "checkInAt");
CREATE INDEX "attendances_buildingId_checkInAt_idx" ON "attendances"("buildingId", "checkInAt");
CREATE INDEX "attendances_userId_checkInAt_idx" ON "attendances"("userId", "checkInAt");
