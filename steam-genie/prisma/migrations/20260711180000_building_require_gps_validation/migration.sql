-- Per-building GPS validation for attendance (replaces SKIP_GPS_VALIDATION env).
ALTER TABLE "buildings" ADD COLUMN "requireGpsValidation" BOOLEAN NOT NULL DEFAULT true;
