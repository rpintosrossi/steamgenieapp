-- CreateTable
CREATE TABLE "user_excluded_buildings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_excluded_buildings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_excluded_buildings_userId_buildingId_key" ON "user_excluded_buildings"("userId", "buildingId");

-- CreateIndex
CREATE INDEX "user_excluded_buildings_userId_idx" ON "user_excluded_buildings"("userId");

-- CreateIndex
CREATE INDEX "user_excluded_buildings_buildingId_idx" ON "user_excluded_buildings"("buildingId");

-- AddForeignKey
ALTER TABLE "user_excluded_buildings" ADD CONSTRAINT "user_excluded_buildings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_excluded_buildings" ADD CONSTRAINT "user_excluded_buildings_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
