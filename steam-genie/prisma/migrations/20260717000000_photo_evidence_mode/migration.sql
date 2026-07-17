-- Photo evidence mode per building + phase photos for services and periodic instances

CREATE TYPE "PhotoEvidenceMode" AS ENUM ('PER_TASK', 'BEFORE_DURING_AFTER');
CREATE TYPE "PhotoPhase" AS ENUM ('BEFORE', 'DURING', 'AFTER');

ALTER TABLE "buildings"
  ADD COLUMN "photoEvidenceMode" "PhotoEvidenceMode" NOT NULL DEFAULT 'PER_TASK';

CREATE TABLE "service_execution_photos" (
    "id" UUID NOT NULL,
    "serviceExecutionId" UUID NOT NULL,
    "phase" "PhotoPhase" NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "storageBucket" VARCHAR(100) NOT NULL DEFAULT 'local',
    "originalFilename" VARCHAR(500),
    "mimeType" VARCHAR(100),
    "fileSizeBytes" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat" DECIMAL(10,7),
    "gpsLng" DECIMAL(10,7),
    "deviceId" VARCHAR(200),
    "clientOperationId" VARCHAR(100),
    "uploadedById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_execution_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "periodic_task_instance_photos" (
    "id" UUID NOT NULL,
    "periodicTaskInstanceId" UUID NOT NULL,
    "phase" "PhotoPhase" NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "storageBucket" VARCHAR(100) NOT NULL DEFAULT 'local',
    "originalFilename" VARCHAR(500),
    "mimeType" VARCHAR(100),
    "fileSizeBytes" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat" DECIMAL(10,7),
    "gpsLng" DECIMAL(10,7),
    "deviceId" VARCHAR(200),
    "clientOperationId" VARCHAR(100),
    "uploadedById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periodic_task_instance_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_execution_photos_clientOperationId_key" ON "service_execution_photos"("clientOperationId");
CREATE INDEX "service_execution_photos_serviceExecutionId_phase_deletedAt_idx" ON "service_execution_photos"("serviceExecutionId", "phase", "deletedAt");

CREATE UNIQUE INDEX "periodic_task_instance_photos_clientOperationId_key" ON "periodic_task_instance_photos"("clientOperationId");
CREATE INDEX "periodic_task_instance_photos_periodicTaskInstanceId_phase_deletedAt_idx" ON "periodic_task_instance_photos"("periodicTaskInstanceId", "phase", "deletedAt");

ALTER TABLE "service_execution_photos" ADD CONSTRAINT "service_execution_photos_serviceExecutionId_fkey" FOREIGN KEY ("serviceExecutionId") REFERENCES "service_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_execution_photos" ADD CONSTRAINT "service_execution_photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "periodic_task_instance_photos" ADD CONSTRAINT "periodic_task_instance_photos_periodicTaskInstanceId_fkey" FOREIGN KEY ("periodicTaskInstanceId") REFERENCES "periodic_task_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "periodic_task_instance_photos" ADD CONSTRAINT "periodic_task_instance_photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
