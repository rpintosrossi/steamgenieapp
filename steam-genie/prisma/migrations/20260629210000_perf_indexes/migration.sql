-- Performance indexes for admin list/assign flows

CREATE INDEX "reservations_buildingId_checkoutAt_idx" ON "reservations"("buildingId", "checkoutAt");
CREATE INDEX "reservations_checkoutAt_idx" ON "reservations"("checkoutAt");

CREATE INDEX "floors_buildingId_deletedAt_idx" ON "floors"("buildingId", "deletedAt");
CREATE INDEX "zones_floorId_deletedAt_idx" ON "zones"("floorId", "deletedAt");
CREATE INDEX "zones_buildingId_deletedAt_idx" ON "zones"("buildingId", "deletedAt");
CREATE INDEX "subzones_zoneId_deletedAt_idx" ON "subzones"("zoneId", "deletedAt");

CREATE INDEX "work_orders_type_buildingId_status_scheduledDate_idx" ON "work_orders"("type", "buildingId", "status", "scheduledDate");
CREATE INDEX "work_orders_reservationId_idx" ON "work_orders"("reservationId");

CREATE INDEX "work_order_assignments_userId_status_idx" ON "work_order_assignments"("userId", "status");

CREATE INDEX "work_order_tasks_workOrderId_idx" ON "work_order_tasks"("workOrderId");
