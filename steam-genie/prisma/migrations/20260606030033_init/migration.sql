-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "TaskFrequency" AS ENUM ('EVENTUAL', 'DAILY', 'MON_FRI', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "TaskFieldType" AS ENUM ('DROPDOWN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('UPCOMING', 'CHECKIN_DAY', 'ACTIVE', 'CHECKOUT_DAY', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('API', 'MANUAL');

-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('CHECKOUT_CLEANING', 'ADDITIONAL_REQUEST');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RejectionReasonType" AS ENUM ('SERVICE_REJECTION', 'TASK_NOT_DONE');

-- CreateEnum
CREATE TYPE "ServiceExecutionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskExecutionStatus" AS ENUM ('DONE', 'NOT_DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PeriodicTaskInstanceStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IntegrationLogStatus" AS ENUM ('RECEIVED', 'PARSED', 'ERROR');

-- CreateEnum
CREATE TYPE "SyncConflictResolutionStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "dni" VARCHAR(20) NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "birthDate" DATE,
    "passwordHash" VARCHAR(255) NOT NULL,
    "primaryRole" VARCHAR(50) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_building_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "buildingId" UUID,
    "roleId" UUID NOT NULL,
    "grantedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_building_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" VARCHAR(200) NOT NULL,
    "platform" "Platform" NOT NULL,
    "pushToken" VARCHAR(500),
    "appVersion" VARCHAR(50),
    "lastSeenAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(300),
    "city" VARCHAR(100),
    "province" VARCHAR(100),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "gpsRadiusM" INTEGER NOT NULL DEFAULT 200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "floorId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "qrToken" VARCHAR(100),
    "qrExpiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subzones" (
    "id" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "qrToken" VARCHAR(100),
    "qrExpiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subzones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "zoneId" UUID,
    "subzoneId" UUID,
    "name" VARCHAR(300) NOT NULL,
    "frequency" "TaskFrequency" NOT NULL,
    "startDate" DATE,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "allowsObservation" BOOLEAN NOT NULL DEFAULT false,
    "requiresRejectionReason" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_custom_fields" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "fieldType" "TaskFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "showInReport" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_custom_field_options" (
    "id" UUID NOT NULL,
    "fieldId" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_custom_field_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rejection_reasons" (
    "id" UUID NOT NULL,
    "type" "RejectionReasonType" NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rejection_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkInOccurredAt" TIMESTAMP(3),
    "checkInGpsLat" DECIMAL(10,7),
    "checkInGpsLng" DECIMAL(10,7),
    "checkInDeviceId" VARCHAR(200),
    "checkInIp" VARCHAR(45),
    "checkOutAt" TIMESTAMP(3),
    "checkOutOccurredAt" TIMESTAMP(3),
    "checkOutGpsLat" DECIMAL(10,7),
    "checkOutGpsLng" DECIMAL(10,7),
    "checkOutDeviceId" VARCHAR(200),
    "checkOutIp" VARCHAR(45),
    "forgotCheckout" BOOLEAN NOT NULL DEFAULT false,
    "isOfflineSynced" BOOLEAN NOT NULL DEFAULT false,
    "clientOperationId" VARCHAR(100),
    "correctedById" UUID,
    "correctionNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "floorId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "subzoneId" UUID,
    "externalId" VARCHAR(200),
    "guestName" VARCHAR(200),
    "checkinAt" TIMESTAMP(3) NOT NULL,
    "checkoutAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'UPCOMING',
    "source" "ReservationSource" NOT NULL DEFAULT 'MANUAL',
    "rawSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "type" "WorkOrderType" NOT NULL,
    "reservationId" UUID,
    "buildingId" UUID NOT NULL,
    "floorId" UUID,
    "zoneId" UUID,
    "subzoneId" UUID,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "scheduledDate" DATE,
    "scheduledTime" TIME,
    "deadlineAt" TIMESTAMP(3),
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "createdById" UUID NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_assignments" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReasonId" UUID,
    "rejectionNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_tasks" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "nameSnapshot" VARCHAR(300) NOT NULL,
    "requiresPhotoSnapshot" BOOLEAN NOT NULL,
    "allowsObservationSnapshot" BOOLEAN NOT NULL,
    "requiresRejectionReasonSnapshot" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_task_custom_fields" (
    "id" UUID NOT NULL,
    "workOrderTaskId" UUID NOT NULL,
    "originalFieldId" UUID NOT NULL,
    "labelSnapshot" VARCHAR(200) NOT NULL,
    "fieldType" VARCHAR(50) NOT NULL,
    "isRequired" BOOLEAN NOT NULL,
    "showInReport" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_task_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_task_custom_field_options" (
    "id" UUID NOT NULL,
    "workOrderTaskFieldId" UUID NOT NULL,
    "originalOptionId" UUID NOT NULL,
    "labelSnapshot" VARCHAR(200) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_task_custom_field_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_executions" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "startedById" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "ServiceExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "clientOperationId" VARCHAR(100),
    "isOfflineSynced" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_execution_participants" (
    "id" UUID NOT NULL,
    "serviceExecutionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_execution_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_executions" (
    "id" UUID NOT NULL,
    "serviceExecutionId" UUID,
    "workOrderTaskId" UUID,
    "periodicTaskInstanceId" UUID,
    "status" "TaskExecutionStatus" NOT NULL,
    "rejectionReasonId" UUID,
    "observation" TEXT,
    "executedById" UUID NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "clientOperationId" VARCHAR(100),
    "isOfflineSynced" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "task_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_execution_field_values" (
    "id" UUID NOT NULL,
    "taskExecutionId" UUID NOT NULL,
    "snapshotFieldId" UUID NOT NULL,
    "selectedOptionIds" UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_execution_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_photos" (
    "id" UUID NOT NULL,
    "taskExecutionId" UUID NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "storageBucket" VARCHAR(100) NOT NULL DEFAULT 'steam-genie',
    "fileSizeBytes" INTEGER,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat" DECIMAL(10,7),
    "gpsLng" DECIMAL(10,7),
    "uploadedById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodic_task_instances" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "periodLabel" VARCHAR(50) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PeriodicTaskInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodic_task_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" UUID NOT NULL,
    "clientOperationId" VARCHAR(100) NOT NULL,
    "deviceId" VARCHAR(200) NOT NULL,
    "userId" UUID NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "operationType" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conflictReason" TEXT NOT NULL,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_inbound_logs" (
    "id" UUID NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "headers" JSONB NOT NULL,
    "rawBody" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "IntegrationLogStatus" NOT NULL DEFAULT 'RECEIVED',
    "parsedPayload" JSONB,
    "errorMessage" TEXT,
    "relatedReservationId" UUID,
    "relatedWorkOrderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_inbound_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "triggeredById" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ip" VARCHAR(45),
    "deviceId" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_dni_key" ON "users"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_building_roles_userId_buildingId_roleId_idx" ON "user_building_roles"("userId", "buildingId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_deviceId_key" ON "user_devices"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "zones_qrToken_key" ON "zones"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "subzones_qrToken_key" ON "subzones"("qrToken");

-- CreateIndex
CREATE INDEX "tasks_buildingId_zoneId_subzoneId_frequency_idx" ON "tasks"("buildingId", "zoneId", "subzoneId", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_clientOperationId_key" ON "attendances"("clientOperationId");

-- CreateIndex
CREATE INDEX "attendances_userId_buildingId_checkInAt_idx" ON "attendances"("userId", "buildingId", "checkInAt");

-- CreateIndex
CREATE INDEX "work_orders_buildingId_status_scheduledDate_idx" ON "work_orders"("buildingId", "status", "scheduledDate");

-- CreateIndex
CREATE INDEX "work_order_assignments_workOrderId_userId_idx" ON "work_order_assignments"("workOrderId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "service_executions_clientOperationId_key" ON "service_executions"("clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "service_executions_workOrderId_key" ON "service_executions"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "service_execution_participants_serviceExecutionId_userId_key" ON "service_execution_participants"("serviceExecutionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_executions_clientOperationId_key" ON "task_executions"("clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "task_executions_serviceExecutionId_workOrderTaskId_key" ON "task_executions"("serviceExecutionId", "workOrderTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "periodic_task_instances_taskId_periodLabel_key" ON "periodic_task_instances"("taskId", "periodLabel");

-- CreateIndex
CREATE INDEX "sync_conflicts_userId_resolvedAt_idx" ON "sync_conflicts"("userId", "resolvedAt");

-- CreateIndex
CREATE INDEX "integration_inbound_logs_source_status_receivedAt_idx" ON "integration_inbound_logs"("source", "status", "receivedAt");

-- AddForeignKey
ALTER TABLE "user_building_roles" ADD CONSTRAINT "user_building_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_building_roles" ADD CONSTRAINT "user_building_roles_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_building_roles" ADD CONSTRAINT "user_building_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_building_roles" ADD CONSTRAINT "user_building_roles_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subzones" ADD CONSTRAINT "subzones_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subzones" ADD CONSTRAINT "subzones_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subzoneId_fkey" FOREIGN KEY ("subzoneId") REFERENCES "subzones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_custom_fields" ADD CONSTRAINT "task_custom_fields_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_custom_field_options" ADD CONSTRAINT "task_custom_field_options_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "task_custom_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_subzoneId_fkey" FOREIGN KEY ("subzoneId") REFERENCES "subzones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_subzoneId_fkey" FOREIGN KEY ("subzoneId") REFERENCES "subzones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_rejectionReasonId_fkey" FOREIGN KEY ("rejectionReasonId") REFERENCES "rejection_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_task_custom_fields" ADD CONSTRAINT "work_order_task_custom_fields_workOrderTaskId_fkey" FOREIGN KEY ("workOrderTaskId") REFERENCES "work_order_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_task_custom_fields" ADD CONSTRAINT "work_order_task_custom_fields_originalFieldId_fkey" FOREIGN KEY ("originalFieldId") REFERENCES "task_custom_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_task_custom_field_options" ADD CONSTRAINT "work_order_task_custom_field_options_workOrderTaskFieldId_fkey" FOREIGN KEY ("workOrderTaskFieldId") REFERENCES "work_order_task_custom_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_task_custom_field_options" ADD CONSTRAINT "work_order_task_custom_field_options_originalOptionId_fkey" FOREIGN KEY ("originalOptionId") REFERENCES "task_custom_field_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_executions" ADD CONSTRAINT "service_executions_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_executions" ADD CONSTRAINT "service_executions_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_executions" ADD CONSTRAINT "service_executions_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_execution_participants" ADD CONSTRAINT "service_execution_participants_serviceExecutionId_fkey" FOREIGN KEY ("serviceExecutionId") REFERENCES "service_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_execution_participants" ADD CONSTRAINT "service_execution_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_execution_participants" ADD CONSTRAINT "service_execution_participants_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_serviceExecutionId_fkey" FOREIGN KEY ("serviceExecutionId") REFERENCES "service_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_workOrderTaskId_fkey" FOREIGN KEY ("workOrderTaskId") REFERENCES "work_order_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_periodicTaskInstanceId_fkey" FOREIGN KEY ("periodicTaskInstanceId") REFERENCES "periodic_task_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_rejectionReasonId_fkey" FOREIGN KEY ("rejectionReasonId") REFERENCES "rejection_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_execution_field_values" ADD CONSTRAINT "task_execution_field_values_taskExecutionId_fkey" FOREIGN KEY ("taskExecutionId") REFERENCES "task_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_execution_field_values" ADD CONSTRAINT "task_execution_field_values_snapshotFieldId_fkey" FOREIGN KEY ("snapshotFieldId") REFERENCES "work_order_task_custom_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_taskExecutionId_fkey" FOREIGN KEY ("taskExecutionId") REFERENCES "task_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodic_task_instances" ADD CONSTRAINT "periodic_task_instances_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_inbound_logs" ADD CONSTRAINT "integration_inbound_logs_relatedReservationId_fkey" FOREIGN KEY ("relatedReservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_inbound_logs" ADD CONSTRAINT "integration_inbound_logs_relatedWorkOrderId_fkey" FOREIGN KEY ("relatedWorkOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
