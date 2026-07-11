-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN "clientAmountCharged" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "work_order_expenses" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "concept" VARCHAR(300) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_expenses" (
    "id" UUID NOT NULL,
    "concept" VARCHAR(300) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "buildingId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_settlements" (
    "id" UUID NOT NULL,
    "beneficiaryUserId" UUID,
    "beneficiaryName" VARCHAR(200) NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "totalClientCharged" DECIMAL(14,2) NOT NULL,
    "totalServiceExpenses" DECIMAL(14,2) NOT NULL,
    "totalFixedExpenses" DECIMAL(14,2) NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "calculationBreakdown" JSONB NOT NULL,
    "currentPdfVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_settlement_items" (
    "id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "titleSnapshot" VARCHAR(300) NOT NULL,
    "scheduledDateSnapshot" DATE,
    "buildingNameSnapshot" VARCHAR(200) NOT NULL,
    "citySnapshot" VARCHAR(100),
    "provinceSnapshot" VARCHAR(100),
    "clientAmountCharged" DECIMAL(12,2) NOT NULL,
    "serviceExpensesTotal" DECIMAL(12,2) NOT NULL,
    "serviceExpensesJson" JSONB NOT NULL,
    "cleanersSnapshot" JSONB NOT NULL,

    CONSTRAINT "commission_settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_settlement_fixed_expenses" (
    "id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "fixedExpenseId" UUID,
    "conceptSnapshot" VARCHAR(300) NOT NULL,
    "buildingNameSnapshot" VARCHAR(200),
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "fullAmount" DECIMAL(12,2) NOT NULL,
    "proratedAmount" DECIMAL(12,2) NOT NULL,
    "daysInBasePeriod" INTEGER NOT NULL,
    "daysOverlapping" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "prorationNote" TEXT,

    CONSTRAINT "commission_settlement_fixed_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_settlement_pdf_versions" (
    "id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "storageBucket" VARCHAR(100) DEFAULT 'local',
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_settlement_pdf_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_expenses_workOrderId_idx" ON "work_order_expenses"("workOrderId");

-- CreateIndex
CREATE INDEX "fixed_expenses_deletedAt_isActive_startDate_idx" ON "fixed_expenses"("deletedAt", "isActive", "startDate");

-- CreateIndex
CREATE INDEX "fixed_expenses_buildingId_idx" ON "fixed_expenses"("buildingId");

-- CreateIndex
CREATE INDEX "commission_settlements_beneficiaryUserId_dateFrom_dateTo_idx" ON "commission_settlements"("beneficiaryUserId", "dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "commission_settlements_createdAt_idx" ON "commission_settlements"("createdAt");

-- CreateIndex
CREATE INDEX "commission_settlements_beneficiaryName_idx" ON "commission_settlements"("beneficiaryName");

-- CreateIndex
CREATE INDEX "commission_settlement_items_settlementId_idx" ON "commission_settlement_items"("settlementId");

-- CreateIndex
CREATE INDEX "commission_settlement_items_workOrderId_idx" ON "commission_settlement_items"("workOrderId");

-- CreateIndex
CREATE INDEX "commission_settlement_fixed_expenses_settlementId_idx" ON "commission_settlement_fixed_expenses"("settlementId");

-- CreateIndex
CREATE INDEX "commission_settlement_pdf_versions_settlementId_idx" ON "commission_settlement_pdf_versions"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_settlement_pdf_versions_settlementId_version_key" ON "commission_settlement_pdf_versions"("settlementId", "version");

-- AddForeignKey
ALTER TABLE "work_order_expenses" ADD CONSTRAINT "work_order_expenses_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_expenses" ADD CONSTRAINT "work_order_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_expenses" ADD CONSTRAINT "fixed_expenses_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_expenses" ADD CONSTRAINT "fixed_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlements" ADD CONSTRAINT "commission_settlements_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlements" ADD CONSTRAINT "commission_settlements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlement_items" ADD CONSTRAINT "commission_settlement_items_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "commission_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlement_items" ADD CONSTRAINT "commission_settlement_items_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlement_fixed_expenses" ADD CONSTRAINT "commission_settlement_fixed_expenses_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "commission_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlement_fixed_expenses" ADD CONSTRAINT "commission_settlement_fixed_expenses_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "fixed_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlement_pdf_versions" ADD CONSTRAINT "commission_settlement_pdf_versions_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "commission_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlement_pdf_versions" ADD CONSTRAINT "commission_settlement_pdf_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
