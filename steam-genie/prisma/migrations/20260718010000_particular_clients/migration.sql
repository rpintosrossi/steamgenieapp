-- CreateTable
CREATE TABLE "particular_clients" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "taxId" VARCHAR(20),
    "address" VARCHAR(300),
    "contactName" VARCHAR(200),
    "email" VARCHAR(200),
    "phone" VARCHAR(50),
    "notes" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "particular_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "particular_clients_deletedAt_idx" ON "particular_clients"("deletedAt");

-- CreateIndex
CREATE INDEX "particular_clients_name_idx" ON "particular_clients"("name");
