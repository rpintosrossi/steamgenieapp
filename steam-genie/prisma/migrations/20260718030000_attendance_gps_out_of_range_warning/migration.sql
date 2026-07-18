-- Advertencia GPS fuera de radio: se permite fichar, pero queda registrado.
ALTER TABLE "attendances" ADD COLUMN "checkInOutOfRange" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attendances" ADD COLUMN "checkInDistanceM" INTEGER;
ALTER TABLE "attendances" ADD COLUMN "checkOutOutOfRange" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attendances" ADD COLUMN "checkOutDistanceM" INTEGER;
