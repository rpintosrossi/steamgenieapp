-- Ensure particular-client sites have at least Planta baja / Principal for LocationPicker.
DO $$
DECLARE
  r RECORD;
  new_floor_id UUID;
BEGIN
  FOR r IN
    SELECT b.id AS building_id
    FROM "buildings" b
    INNER JOIN "particular_clients" pc ON pc."buildingId" = b.id
    WHERE b."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "floors" f
        WHERE f."buildingId" = b.id AND f."deletedAt" IS NULL
      )
  LOOP
    new_floor_id := gen_random_uuid();
    INSERT INTO "floors" ("id", "buildingId", "name", "sortOrder", "createdAt", "updatedAt")
    VALUES (new_floor_id, r.building_id, 'Planta baja', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    INSERT INTO "zones" ("id", "floorId", "buildingId", "name", "qrToken", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), new_floor_id, r.building_id, 'Principal', gen_random_uuid()::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  END LOOP;
END $$;
