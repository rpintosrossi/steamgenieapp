import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { parseCalendarDateInput } from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { CommissionPdfService } from './commission-pdf.service';
import {
  CreateCommissionSettlementDto,
  QueryCommissionServicesDto,
  QuerySettlementsDto,
  UpdateCommissionSettlementDto,
} from './dto/commissions.dto';

function daysBetweenInclusive(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: CommissionPdfService,
    private readonly storage: StorageService,
  ) {}

  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value == null) return 0;
    return typeof value === 'number' ? value : value.toNumber();
  }

  private money(n: number): string {
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  async listBeneficiaries() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, fullName: true, dni: true, primaryRole: true },
      orderBy: { fullName: 'asc' },
      take: 500,
    });
    return users;
  }

  async listCandidateServices(query: QueryCommissionServicesDto) {
    const dateFrom = parseCalendarDateInput(query.dateFrom);
    const dateTo = parseCalendarDateInput(query.dateTo);
    if (dateTo < dateFrom) {
      throw new BadRequestException('El rango de fechas es inválido.');
    }

    const nextDay = new Date(dateTo);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      deletedAt: null,
      scheduledDate: { gte: dateFrom, lt: nextDay },
    };

    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.city) where.building = { ...(where.building ?? {}), city: query.city };
    if (query.province) {
      where.building = { ...(where.building ?? {}), province: query.province };
    }
    if (query.cleanerId) {
      where.assignments = {
        some: {
          userId: query.cleanerId,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
      };
    }
    if (query.amountFilter === 'with_amount') {
      where.clientAmountCharged = { not: null };
    } else if (query.amountFilter === 'without_amount') {
      where.clientAmountCharged = null;
    }

    const rows = await this.prisma.workOrder.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        scheduledDate: true,
        clientAmountCharged: true,
        building: {
          select: { id: true, name: true, city: true, province: true },
        },
        assignments: {
          where: { status: { in: ['PENDING', 'ACCEPTED'] } },
          select: {
            userId: true,
            user: { select: { id: true, fullName: true } },
          },
        },
        expenses: {
          select: { id: true, concept: true, amount: true },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { title: 'asc' }],
    });

    return rows.map((row) => {
      const expenses = row.expenses.map((e) => ({
        id: e.id,
        concept: e.concept,
        amount: this.toNumber(e.amount),
      }));
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        scheduledDate: row.scheduledDate,
        clientAmountCharged: row.clientAmountCharged == null
          ? null
          : this.toNumber(row.clientAmountCharged),
        building: row.building,
        cleaners: row.assignments.map((a) => ({
          id: a.user.id,
          fullName: a.user.fullName,
        })),
        expenses,
        expensesTotal: expenses.reduce((s, e) => s + e.amount, 0),
      };
    });
  }

  async previewFixedExpenses(dateFromStr: string, dateToStr: string, buildingIds?: string[]) {
    const dateFrom = parseCalendarDateInput(dateFromStr);
    const dateTo = parseCalendarDateInput(dateToStr);
    return this.computeProratedFixedExpenses(dateFrom, dateTo, buildingIds ?? []);
  }

  private async computeProratedFixedExpenses(
    dateFrom: Date,
    dateTo: Date,
    buildingIds: string[],
  ) {
    const commissionDays = daysBetweenInclusive(dateFrom, dateTo);
    const expenses = await this.prisma.fixedExpense.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        startDate: { lte: dateTo },
        OR: [{ endDate: null }, { endDate: { gte: dateFrom } }],
        AND: [
          {
            OR: [
              { buildingId: null },
              ...(buildingIds.length > 0 ? [{ buildingId: { in: buildingIds } }] : []),
            ],
          },
        ],
      },
      include: { building: { select: { id: true, name: true } } },
    });

    return expenses
      .map((fe) => {
        const expenseStart = fe.startDate;
        const expenseEnd = fe.endDate;
        const overlapStart = maxDate(dateFrom, expenseStart);
        const overlapEnd = expenseEnd ? minDate(dateTo, expenseEnd) : dateTo;
        if (overlapEnd < overlapStart) return null;

        const daysOverlapping = daysBetweenInclusive(overlapStart, overlapEnd);
        let daysInBasePeriod: number;
        let prorationNote: string;

        if (expenseEnd) {
          daysInBasePeriod = daysBetweenInclusive(expenseStart, expenseEnd);
          const prorated =
            this.toNumber(fe.amount) * (daysOverlapping / daysInBasePeriod);
          prorationNote =
            `Prorrateo: ${this.money(this.toNumber(fe.amount))} × (${daysOverlapping} días solapados / ${daysInBasePeriod} días del gasto) = ${this.money(prorated)}`;
          return {
            fixedExpenseId: fe.id,
            concept: fe.concept,
            buildingId: fe.buildingId,
            buildingName: fe.building?.name ?? null,
            isGlobal: fe.buildingId == null,
            fullAmount: this.toNumber(fe.amount),
            proratedAmount: Math.round(prorated * 100) / 100,
            daysInBasePeriod,
            daysOverlapping,
            prorationNote,
            included: true,
          };
        }

        // Sin fin: monto se interpreta sobre el período de la comisión.
        daysInBasePeriod = commissionDays;
        const prorated =
          this.toNumber(fe.amount) * (daysOverlapping / daysInBasePeriod);
        prorationNote =
          `Prorrateo (sin fecha de fin): ${this.money(this.toNumber(fe.amount))} × (${daysOverlapping} / ${daysInBasePeriod} días del período de comisión) = ${this.money(prorated)}`;
        return {
          fixedExpenseId: fe.id,
          concept: fe.concept,
          buildingId: fe.buildingId,
          buildingName: fe.building?.name ?? null,
          isGlobal: fe.buildingId == null,
          fullAmount: this.toNumber(fe.amount),
          proratedAmount: Math.round(prorated * 100) / 100,
          daysInBasePeriod,
          daysOverlapping,
          prorationNote,
          included: true,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }

  async create(dto: CreateCommissionSettlementDto, user: AuthUser) {
    if (!dto.beneficiaryUserId && !dto.externalBeneficiaryName?.trim()) {
      throw new BadRequestException(
        'Debés indicar un usuario beneficiario o el nombre de una persona externa.',
      );
    }
    if (dto.beneficiaryUserId && dto.externalBeneficiaryName?.trim()) {
      throw new BadRequestException(
        'Indicá usuario del sistema o persona externa, no ambos.',
      );
    }

    const dateFrom = parseCalendarDateInput(dto.dateFrom);
    const dateTo = parseCalendarDateInput(dto.dateTo);
    if (dateTo < dateFrom) {
      throw new BadRequestException('El rango de fechas es inválido.');
    }

    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        id: { in: dto.workOrderIds },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        scheduledDate: true,
        clientAmountCharged: true,
        buildingId: true,
        building: {
          select: { id: true, name: true, city: true, province: true },
        },
        assignments: {
          where: { status: { in: ['PENDING', 'ACCEPTED'] } },
          select: { user: { select: { id: true, fullName: true } } },
        },
        expenses: { select: { concept: true, amount: true } },
      },
    });

    if (workOrders.length !== dto.workOrderIds.length) {
      throw new BadRequestException('Uno o más servicios no existen.');
    }

    const missingAmount = workOrders.filter((wo) => wo.clientAmountCharged == null);
    if (missingAmount.length > 0) {
      throw new BadRequestException({
        message:
          'No se puede calcular: faltan montos cobrados al cliente en algunos servicios.',
        missingWorkOrderIds: missingAmount.map((w) => w.id),
        missingTitles: missingAmount.map((w) => w.title),
      });
    }

    let beneficiaryName = dto.externalBeneficiaryName?.trim() ?? '';
    if (dto.beneficiaryUserId) {
      const beneficiary = await this.prisma.user.findFirst({
        where: { id: dto.beneficiaryUserId, deletedAt: null },
        select: { id: true, fullName: true },
      });
      if (!beneficiary) throw new NotFoundException('Usuario beneficiario no encontrado');
      beneficiaryName = beneficiary.fullName;
    }

    const buildingIds = [...new Set(workOrders.map((w) => w.buildingId))];
    const excluded = new Set(dto.excludedFixedExpenseIds ?? []);
    const fixedLines = (await this.computeProratedFixedExpenses(dateFrom, dateTo, buildingIds)).map(
      (line) => ({
        ...line,
        included: !excluded.has(line.fixedExpenseId),
      }),
    );

    const items = workOrders.map((wo) => {
      const expenses = wo.expenses.map((e) => ({
        concept: e.concept,
        amount: this.toNumber(e.amount),
      }));
      return {
        workOrderId: wo.id,
        titleSnapshot: wo.title,
        scheduledDateSnapshot: wo.scheduledDate,
        buildingNameSnapshot: wo.building.name,
        citySnapshot: wo.building.city,
        provinceSnapshot: wo.building.province,
        clientAmountCharged: this.toNumber(wo.clientAmountCharged),
        serviceExpensesTotal: expenses.reduce((s, e) => s + e.amount, 0),
        serviceExpensesJson: expenses,
        cleanersSnapshot: wo.assignments.map((a) => ({
          id: a.user.id,
          fullName: a.user.fullName,
        })),
      };
    });

    const totals = this.computeTotals(items, fixedLines, dto.percentage);
    const calculationBreakdown = this.buildBreakdown(
      items,
      fixedLines,
      dto.percentage,
      totals,
      formatDateKey(dateFrom),
      formatDateKey(dateTo),
    );

    const settlement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.commissionSettlement.create({
        data: {
          beneficiaryUserId: dto.beneficiaryUserId ?? null,
          beneficiaryName,
          dateFrom,
          dateTo,
          percentage: new Prisma.Decimal(dto.percentage),
          totalClientCharged: new Prisma.Decimal(totals.totalClientCharged),
          totalServiceExpenses: new Prisma.Decimal(totals.totalServiceExpenses),
          totalFixedExpenses: new Prisma.Decimal(totals.totalFixedExpenses),
          netAmount: new Prisma.Decimal(totals.netAmount),
          commissionAmount: new Prisma.Decimal(totals.commissionAmount),
          calculationBreakdown,
          currentPdfVersion: 1,
          createdById: user.id,
          items: {
            create: items.map((item) => ({
              workOrderId: item.workOrderId,
              titleSnapshot: item.titleSnapshot,
              scheduledDateSnapshot: item.scheduledDateSnapshot,
              buildingNameSnapshot: item.buildingNameSnapshot,
              citySnapshot: item.citySnapshot,
              provinceSnapshot: item.provinceSnapshot,
              clientAmountCharged: new Prisma.Decimal(item.clientAmountCharged),
              serviceExpensesTotal: new Prisma.Decimal(item.serviceExpensesTotal),
              serviceExpensesJson: item.serviceExpensesJson,
              cleanersSnapshot: item.cleanersSnapshot,
            })),
          },
          fixedExpenses: {
            create: fixedLines.map((line) => ({
              fixedExpenseId: line.fixedExpenseId,
              conceptSnapshot: line.concept,
              buildingNameSnapshot: line.buildingName,
              isGlobal: line.isGlobal,
              fullAmount: new Prisma.Decimal(line.fullAmount),
              proratedAmount: new Prisma.Decimal(line.proratedAmount),
              daysInBasePeriod: line.daysInBasePeriod,
              daysOverlapping: line.daysOverlapping,
              included: line.included,
              prorationNote: line.prorationNote,
            })),
          },
        },
        include: this.detailInclude(),
      });
      return created;
    });

    try {
      await this.generatePdfVersion(settlement, 1, user.id, 'Versión inicial');
    } catch (err) {
      // Evita dejar rendiciones huérfanas sin PDF (p. ej. doble click o fallo de generación).
      await this.prisma.commissionSettlement.delete({ where: { id: settlement.id } }).catch(() => undefined);
      throw err;
    }

    return this.findOne(settlement.id, user, { asAdmin: true });
  }

  private computeTotals(
    items: Array<{ clientAmountCharged: number; serviceExpensesTotal: number }>,
    fixedLines: Array<{ proratedAmount: number; included: boolean }>,
    percentage: number,
  ) {
    const totalClientCharged = items.reduce((s, i) => s + i.clientAmountCharged, 0);
    const totalServiceExpenses = items.reduce((s, i) => s + i.serviceExpensesTotal, 0);
    const totalFixedExpenses = fixedLines
      .filter((f) => f.included)
      .reduce((s, f) => s + f.proratedAmount, 0);
    const netAmount =
      Math.round((totalClientCharged - totalServiceExpenses - totalFixedExpenses) * 100) / 100;
    const commissionAmount = Math.round(netAmount * (percentage / 100) * 100) / 100;
    return {
      totalClientCharged: Math.round(totalClientCharged * 100) / 100,
      totalServiceExpenses: Math.round(totalServiceExpenses * 100) / 100,
      totalFixedExpenses: Math.round(totalFixedExpenses * 100) / 100,
      netAmount,
      commissionAmount,
    };
  }

  private buildBreakdown(
    items: Array<{ clientAmountCharged: number; serviceExpensesTotal: number }>,
    fixedLines: Array<{
      concept: string;
      included: boolean;
      proratedAmount: number;
      prorationNote: string;
    }>,
    percentage: number,
    totals: ReturnType<CommissionsService['computeTotals']>,
    dateFrom: string,
    dateTo: string,
  ) {
    const lines = [
      `Período de comisión: ${dateFrom} → ${dateTo}`,
      `Servicios incluidos: ${items.length}`,
      `Σ Cobrado al cliente = ${this.money(totals.totalClientCharged)}`,
      `Σ Gastos de cada servicio = ${this.money(totals.totalServiceExpenses)}`,
      `Σ Gastos fijos incluidos (prorrateados) = ${this.money(totals.totalFixedExpenses)}`,
      `Neto = Cobrado − Gastos servicios − Gastos fijos = ${this.money(totals.netAmount)}`,
      `Comisión = Neto × ${percentage}% = ${this.money(totals.commissionAmount)}`,
    ];
    for (const fe of fixedLines) {
      if (fe.included) lines.push(`Gasto fijo «${fe.concept}»: ${fe.prorationNote}`);
      else lines.push(`Gasto fijo «${fe.concept}»: excluido de esta rendición`);
    }
    return { lines, totals, percentage, dateFrom, dateTo };
  }

  private detailInclude() {
    return {
      items: { orderBy: { scheduledDateSnapshot: 'asc' as const } },
      fixedExpenses: { orderBy: { conceptSnapshot: 'asc' as const } },
      pdfVersions: { orderBy: { version: 'desc' as const } },
      createdBy: { select: { id: true, fullName: true } },
      beneficiaryUser: { select: { id: true, fullName: true, dni: true } },
    };
  }

  private serializeSettlement(
    row: Awaited<ReturnType<CommissionsService['loadSettlement']>>,
  ) {
    const breakdown = row.calculationBreakdown as { lines?: string[] };
    return {
      id: row.id,
      beneficiaryUserId: row.beneficiaryUserId,
      beneficiaryName: row.beneficiaryName,
      beneficiaryUser: row.beneficiaryUser,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      percentage: this.toNumber(row.percentage),
      totalClientCharged: this.toNumber(row.totalClientCharged),
      totalServiceExpenses: this.toNumber(row.totalServiceExpenses),
      totalFixedExpenses: this.toNumber(row.totalFixedExpenses),
      netAmount: this.toNumber(row.netAmount),
      commissionAmount: this.toNumber(row.commissionAmount),
      calculationBreakdown: breakdown,
      currentPdfVersion: row.currentPdfVersion,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items: row.items.map((item) => ({
        id: item.id,
        workOrderId: item.workOrderId,
        title: item.titleSnapshot,
        scheduledDate: item.scheduledDateSnapshot,
        buildingName: item.buildingNameSnapshot,
        city: item.citySnapshot,
        province: item.provinceSnapshot,
        clientAmountCharged: this.toNumber(item.clientAmountCharged),
        serviceExpensesTotal: this.toNumber(item.serviceExpensesTotal),
        serviceExpenses: item.serviceExpensesJson as Array<{ concept: string; amount: number }>,
        cleaners: item.cleanersSnapshot as Array<{ id?: string; fullName: string }>,
      })),
      fixedExpenses: row.fixedExpenses.map((fe) => ({
        id: fe.id,
        fixedExpenseId: fe.fixedExpenseId,
        concept: fe.conceptSnapshot,
        buildingName: fe.buildingNameSnapshot,
        isGlobal: fe.isGlobal,
        fullAmount: this.toNumber(fe.fullAmount),
        proratedAmount: this.toNumber(fe.proratedAmount),
        daysInBasePeriod: fe.daysInBasePeriod,
        daysOverlapping: fe.daysOverlapping,
        included: fe.included,
        prorationNote: fe.prorationNote,
      })),
      pdfVersions: row.pdfVersions.map((pdf) => ({
        id: pdf.id,
        version: pdf.version,
        note: pdf.note,
        createdAt: pdf.createdAt,
        createdById: pdf.createdById,
      })),
    };
  }

  private async loadSettlement(id: string) {
    const row = await this.prisma.commissionSettlement.findUnique({
      where: { id },
      include: this.detailInclude(),
    });
    if (!row) throw new NotFoundException('Rendición no encontrada');
    return row;
  }

  async findOne(
    id: string,
    user: AuthUser,
    opts: { asAdmin?: boolean; asMine?: boolean } = {},
  ) {
    const row = await this.loadSettlement(id);
    if (opts.asMine) {
      if (row.beneficiaryUserId !== user.id) {
        throw new ForbiddenException('No tenés acceso a esta rendición.');
      }
    } else if (!opts.asAdmin) {
      if (row.beneficiaryUserId !== user.id) {
        throw new ForbiddenException('No tenés acceso a esta rendición.');
      }
    }
    return this.serializeSettlement(row);
  }

  async findAll(query: QuerySettlementsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (query.beneficiaryUserId) where.beneficiaryUserId = query.beneficiaryUserId;
    if (query.beneficiaryName) {
      where.beneficiaryName = { contains: query.beneficiaryName, mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.AND = [];
      if (query.dateFrom) {
        where.AND.push({ dateTo: { gte: parseCalendarDateInput(query.dateFrom) } });
      }
      if (query.dateTo) {
        where.AND.push({ dateFrom: { lte: parseCalendarDateInput(query.dateTo) } });
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.commissionSettlement.count({ where }),
      this.prisma.commissionSettlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          beneficiaryUser: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        beneficiaryName: row.beneficiaryName,
        beneficiaryUserId: row.beneficiaryUserId,
        beneficiaryUser: row.beneficiaryUser,
        dateFrom: row.dateFrom,
        dateTo: row.dateTo,
        percentage: this.toNumber(row.percentage),
        commissionAmount: this.toNumber(row.commissionAmount),
        netAmount: this.toNumber(row.netAmount),
        currentPdfVersion: row.currentPdfVersion,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  async findMine(user: AuthUser, query: QuerySettlementsDto) {
    return this.findAll({
      ...query,
      beneficiaryUserId: user.id,
    });
  }

  async mySummary(user: AuthUser) {
    const count = await this.prisma.commissionSettlement.count({
      where: { beneficiaryUserId: user.id },
    });
    return { count, hasSettlements: count > 0 };
  }

  async update(id: string, dto: UpdateCommissionSettlementDto, user: AuthUser) {
    const existing = await this.loadSettlement(id);
    const percentage = dto.percentage ?? this.toNumber(existing.percentage);

    const items = existing.items.map((item) => {
      const patch = dto.items?.find((i) => i.id === item.id);
      const clientAmountCharged =
        patch?.clientAmountCharged != null
          ? patch.clientAmountCharged
          : this.toNumber(item.clientAmountCharged);
      return {
        id: item.id,
        workOrderId: item.workOrderId,
        titleSnapshot: item.titleSnapshot,
        scheduledDateSnapshot: item.scheduledDateSnapshot,
        buildingNameSnapshot: item.buildingNameSnapshot,
        citySnapshot: item.citySnapshot,
        provinceSnapshot: item.provinceSnapshot,
        clientAmountCharged,
        serviceExpensesTotal: this.toNumber(item.serviceExpensesTotal),
        serviceExpensesJson: item.serviceExpensesJson as Array<{
          concept: string;
          amount: number;
        }>,
        cleanersSnapshot: item.cleanersSnapshot as Array<{ id?: string; fullName: string }>,
      };
    });

    const fixedLines = existing.fixedExpenses.map((fe) => {
      const patch = dto.fixedExpenses?.find((f) => f.id === fe.id);
      return {
        id: fe.id,
        fixedExpenseId: fe.fixedExpenseId,
        concept: fe.conceptSnapshot,
        buildingName: fe.buildingNameSnapshot,
        isGlobal: fe.isGlobal,
        fullAmount: this.toNumber(fe.fullAmount),
        proratedAmount: this.toNumber(fe.proratedAmount),
        daysInBasePeriod: fe.daysInBasePeriod,
        daysOverlapping: fe.daysOverlapping,
        included: patch ? patch.included : fe.included,
        prorationNote: fe.prorationNote ?? '',
      };
    });

    const totals = this.computeTotals(items, fixedLines, percentage);
    const calculationBreakdown = this.buildBreakdown(
      items,
      fixedLines,
      percentage,
      totals,
      formatDateKey(existing.dateFrom),
      formatDateKey(existing.dateTo),
    );
    const nextVersion = existing.currentPdfVersion + 1;

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.commissionSettlementItem.update({
          where: { id: item.id },
          data: {
            clientAmountCharged: new Prisma.Decimal(item.clientAmountCharged),
          },
        });
      }
      for (const fe of fixedLines) {
        await tx.commissionSettlementFixedExpense.update({
          where: { id: fe.id },
          data: { included: fe.included },
        });
      }
      await tx.commissionSettlement.update({
        where: { id },
        data: {
          percentage: new Prisma.Decimal(percentage),
          totalClientCharged: new Prisma.Decimal(totals.totalClientCharged),
          totalServiceExpenses: new Prisma.Decimal(totals.totalServiceExpenses),
          totalFixedExpenses: new Prisma.Decimal(totals.totalFixedExpenses),
          netAmount: new Prisma.Decimal(totals.netAmount),
          commissionAmount: new Prisma.Decimal(totals.commissionAmount),
          calculationBreakdown,
          currentPdfVersion: nextVersion,
        },
      });
    });

    const updated = await this.loadSettlement(id);
    await this.generatePdfVersion(
      updated,
      nextVersion,
      user.id,
      dto.versionNote?.trim() || `Actualización v${nextVersion}`,
    );
    return this.findOne(id, user, { asAdmin: true });
  }

  private async generatePdfVersion(
    settlement: Awaited<ReturnType<CommissionsService['loadSettlement']>>,
    version: number,
    createdById: string,
    note: string,
  ) {
    const serialized = this.serializeSettlement(settlement);
    const breakdown = serialized.calculationBreakdown as { lines?: string[] };
    const stored = await this.pdfService.generateAndStore(
      {
        id: serialized.id,
        beneficiaryName: serialized.beneficiaryName,
        dateFrom: formatDateKey(new Date(serialized.dateFrom)),
        dateTo: formatDateKey(new Date(serialized.dateTo)),
        percentage: serialized.percentage,
        totalClientCharged: serialized.totalClientCharged,
        totalServiceExpenses: serialized.totalServiceExpenses,
        totalFixedExpenses: serialized.totalFixedExpenses,
        netAmount: serialized.netAmount,
        commissionAmount: serialized.commissionAmount,
        version,
        createdAt: new Date(serialized.createdAt).toLocaleString('es-AR'),
        items: serialized.items.map((item) => ({
          title: item.title,
          scheduledDate: item.scheduledDate
            ? formatDateKey(new Date(item.scheduledDate))
            : null,
          buildingName: item.buildingName,
          city: item.city,
          province: item.province,
          clientAmountCharged: item.clientAmountCharged,
          serviceExpensesTotal: item.serviceExpensesTotal,
          serviceExpenses: item.serviceExpenses,
          cleaners: item.cleaners,
        })),
        fixedExpenses: serialized.fixedExpenses.map((fe) => ({
          concept: fe.concept,
          buildingName: fe.buildingName,
          isGlobal: fe.isGlobal,
          fullAmount: fe.fullAmount,
          proratedAmount: fe.proratedAmount,
          included: fe.included,
          prorationNote: fe.prorationNote,
        })),
        calculationLines: breakdown.lines ?? [],
      },
      createdById,
    );

    await this.prisma.commissionSettlementPdfVersion.create({
      data: {
        settlementId: settlement.id,
        version,
        storageKey: stored.storageKey,
        storageBucket: stored.storageBucket,
        note,
        createdById,
      },
    });
  }

  async downloadPdf(
    id: string,
    user: AuthUser,
    opts: { asAdmin?: boolean; version?: number } = {},
  ) {
    let settlement = await this.loadSettlement(id);
    if (!opts.asAdmin && settlement.beneficiaryUserId !== user.id) {
      throw new ForbiddenException('No tenés acceso a esta rendición.');
    }

    const version = opts.version ?? settlement.currentPdfVersion;
    let pdf = settlement.pdfVersions.find((p) => p.version === version);

    // Regenera si la rendición quedó sin archivo (p. ej. falló el PDF en el create).
    if (!pdf) {
      await this.generatePdfVersion(
        settlement,
        version,
        user.id,
        `Regenerado al descargar (v${version})`,
      );
      settlement = await this.loadSettlement(id);
      pdf = settlement.pdfVersions.find((p) => p.version === version);
      if (!pdf) throw new NotFoundException('PDF no encontrado');
    }

    const filename = `rendicion-${id.slice(0, 8)}-v${version}.pdf`;

    const objectBuffer = await this.storage.getObjectBuffer(pdf.storageKey);
    if (objectBuffer) {
      return {
        file: new StreamableFile(objectBuffer, {
          type: 'application/pdf',
          disposition: `attachment; filename="${filename}"`,
        }),
      };
    }

    const localStream = this.storage.getLocalStream(pdf.storageKey);
    if (localStream) {
      return {
        file: new StreamableFile(localStream, {
          type: 'application/pdf',
          disposition: `attachment; filename="${filename}"`,
        }),
      };
    }

    const fallback = join(process.cwd(), 'uploads', pdf.storageKey);
    if (existsSync(fallback)) {
      return {
        file: new StreamableFile(createReadStream(fallback), {
          type: 'application/pdf',
          disposition: `attachment; filename="${filename}"`,
        }),
      };
    }

    // Último recurso: regenerar el archivo y reintentar lectura.
    await this.generatePdfVersion(
      settlement,
      version + 1,
      user.id,
      `Archivo faltante — regenerado como v${version + 1}`,
    );
    await this.prisma.commissionSettlement.update({
      where: { id },
      data: { currentPdfVersion: version + 1 },
    });
    settlement = await this.loadSettlement(id);
    const regenerated = settlement.pdfVersions.find((p) => p.version === version + 1);
    if (!regenerated) throw new NotFoundException('Archivo PDF no disponible');

    const regeneratedBuffer = await this.storage.getObjectBuffer(regenerated.storageKey);
    if (regeneratedBuffer) {
      return {
        file: new StreamableFile(regeneratedBuffer, {
          type: 'application/pdf',
          disposition: `attachment; filename="rendicion-${id.slice(0, 8)}-v${version + 1}.pdf"`,
        }),
      };
    }

    throw new NotFoundException('Archivo PDF no disponible');
  }
}
