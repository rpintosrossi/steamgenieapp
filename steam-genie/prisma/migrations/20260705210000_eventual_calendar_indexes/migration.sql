-- Calendario trabajos eventuales: consultas por edificio y solapamiento de reservas

CREATE INDEX "reservations_buildingId_checkinAt_idx" ON "reservations"("buildingId", "checkinAt");
CREATE INDEX "reservations_buildingId_floorId_zoneId_idx" ON "reservations"("buildingId", "floorId", "zoneId");
