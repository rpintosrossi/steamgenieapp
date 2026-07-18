-- AlterTable: link particular clients to an operational building (site)
ALTER TABLE "particular_clients" ADD COLUMN "buildingId" UUID;

-- Backfill: create a site building for each existing particular client
DO $$
DECLARE
  r RECORD;
  new_building_id UUID;
BEGIN
  FOR r IN
    SELECT id, name, address, "isActive", "deletedAt", "createdAt", "updatedAt"
    FROM "particular_clients"
    WHERE "buildingId" IS NULL
  LOOP
    new_building_id := gen_random_uuid();
    INSERT INTO "buildings" (
      "id", "name", "address", "isActive", "deletedAt", "createdAt", "updatedAt"
    ) VALUES (
      new_building_id,
      r.name,
      r.address,
      r."isActive",
      r."deletedAt",
      r."createdAt",
      r."updatedAt"
    );
    UPDATE "particular_clients"
    SET "buildingId" = new_building_id
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "particular_clients" ALTER COLUMN "buildingId" SET NOT NULL;

CREATE UNIQUE INDEX "particular_clients_buildingId_key" ON "particular_clients"("buildingId");

ALTER TABLE "particular_clients"
  ADD CONSTRAINT "particular_clients_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "buildings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
