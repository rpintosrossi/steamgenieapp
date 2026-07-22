-- Cliente eventual (nombre + dirección) para presupuestos sin sitio operativo.

CREATE TABLE "eventual_clients" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(300),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventual_clients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "eventual_clients_deletedAt_idx" ON "eventual_clients"("deletedAt");
CREATE INDEX "eventual_clients_name_idx" ON "eventual_clients"("name");

ALTER TABLE "quotes"
  ADD COLUMN "eventualClientId" UUID;

CREATE INDEX "quotes_eventualClientId_idx" ON "quotes"("eventualClientId");

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_eventualClientId_fkey"
  FOREIGN KEY ("eventualClientId") REFERENCES "eventual_clients"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
