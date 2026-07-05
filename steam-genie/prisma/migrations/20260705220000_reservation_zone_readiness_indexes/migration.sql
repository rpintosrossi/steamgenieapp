-- Disponibilidad de zona en reservas: consultas acotadas por zona y fechas

CREATE INDEX "reservations_zoneId_checkoutAt_idx" ON "reservations"("zoneId", "checkoutAt");

CREATE INDEX "work_orders_zoneId_type_status_completedAt_idx"
  ON "work_orders"("zoneId", "type", "status", "completedAt");
