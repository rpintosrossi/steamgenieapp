import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseCalendarDateInput } from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CreateFixedExpenseDto,
  CreateWorkOrderExpenseDto,
  UpdateClientAmountDto,
  UpdateFixedExpenseDto,
  UpdateWorkOrderExpenseDto,
} from './dto/expenses.dto';

@Injectable()
export class WorkOrderExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
    if (value == null) return null;
    return typeof value === 'number' ? value : value.toNumber();
  }

  private serializeExpense(row: {
    id: string;
    workOrderId: string;
    concept: string;
    amount: Prisma.Decimal;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...row,
      amount: this.toNumber(row.amount) ?? 0,
    };
  }

  async getFinance(workOrderId: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledDate: true,
        clientAmountCharged: true,
        building: { select: { id: true, name: true, city: true, province: true } },
        expenses: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!wo) throw new NotFoundException('Servicio no encontrado');

    return {
      id: wo.id,
      title: wo.title,
      status: wo.status,
      scheduledDate: wo.scheduledDate,
      clientAmountCharged: this.toNumber(wo.clientAmountCharged),
      building: wo.building,
      expenses: wo.expenses.map((e) => this.serializeExpense(e)),
      expensesTotal: wo.expenses.reduce((sum, e) => sum + (this.toNumber(e.amount) ?? 0), 0),
    };
  }

  async updateClientAmount(workOrderId: string, dto: UpdateClientAmountDto) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { id: true },
    });
    if (!wo) throw new NotFoundException('Servicio no encontrado');

    const updated = await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        clientAmountCharged:
          dto.clientAmountCharged == null
            ? null
            : new Prisma.Decimal(dto.clientAmountCharged),
      },
      select: { id: true, clientAmountCharged: true },
    });

    return {
      id: updated.id,
      clientAmountCharged: this.toNumber(updated.clientAmountCharged),
    };
  }

  async createExpense(workOrderId: string, dto: CreateWorkOrderExpenseDto, userId: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { id: true },
    });
    if (!wo) throw new NotFoundException('Servicio no encontrado');

    const created = await this.prisma.workOrderExpense.create({
      data: {
        workOrderId,
        concept: dto.concept.trim(),
        amount: new Prisma.Decimal(dto.amount),
        createdById: userId,
      },
    });
    return this.serializeExpense(created);
  }

  async updateExpense(expenseId: string, dto: UpdateWorkOrderExpenseDto) {
    const existing = await this.prisma.workOrderExpense.findUnique({
      where: { id: expenseId },
    });
    if (!existing) throw new NotFoundException('Gasto no encontrado');

    const updated = await this.prisma.workOrderExpense.update({
      where: { id: expenseId },
      data: {
        ...(dto.concept != null ? { concept: dto.concept.trim() } : {}),
        ...(dto.amount != null ? { amount: new Prisma.Decimal(dto.amount) } : {}),
      },
    });
    return this.serializeExpense(updated);
  }

  async deleteExpense(expenseId: string) {
    const existing = await this.prisma.workOrderExpense.findUnique({
      where: { id: expenseId },
    });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    await this.prisma.workOrderExpense.delete({ where: { id: expenseId } });
    return { message: 'Gasto eliminado' };
  }
}

@Injectable()
export class FixedExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: Prisma.Decimal | number): number {
    return typeof value === 'number' ? value : value.toNumber();
  }

  private serialize(row: {
    id: string;
    concept: string;
    amount: Prisma.Decimal;
    startDate: Date;
    endDate: Date | null;
    buildingId: string | null;
    isActive: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    building?: { id: string; name: string } | null;
  }) {
    return {
      id: row.id,
      concept: row.concept,
      amount: this.toNumber(row.amount),
      startDate: row.startDate,
      endDate: row.endDate,
      buildingId: row.buildingId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      building: row.building ?? null,
      scope: row.buildingId ? 'building' : 'global',
    };
  }

  async findAll(includeInactive = false) {
    const rows = await this.prisma.fixedExpense.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { building: { select: { id: true, name: true } } },
      orderBy: [{ startDate: 'desc' }, { concept: 'asc' }],
    });
    return rows.map((r) => this.serialize(r));
  }

  async create(dto: CreateFixedExpenseDto, userId: string) {
    const startDate = parseCalendarDateInput(dto.startDate);
    const endDate =
      dto.endDate == null || dto.endDate === ''
        ? null
        : parseCalendarDateInput(dto.endDate);

    if (endDate && endDate < startDate) {
      throw new BadRequestException('La fecha de fin no puede ser anterior al inicio.');
    }

    if (dto.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.buildingId, deletedAt: null },
        select: { id: true },
      });
      if (!building) throw new NotFoundException('Edificio no encontrado');
    }

    const created = await this.prisma.fixedExpense.create({
      data: {
        concept: dto.concept.trim(),
        amount: new Prisma.Decimal(dto.amount),
        startDate,
        endDate,
        buildingId: dto.buildingId ?? null,
        createdById: userId,
      },
      include: { building: { select: { id: true, name: true } } },
    });
    return this.serialize(created);
  }

  async update(id: string, dto: UpdateFixedExpenseDto) {
    const existing = await this.prisma.fixedExpense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Gasto fijo no encontrado');

    const startDate =
      dto.startDate != null ? parseCalendarDateInput(dto.startDate) : existing.startDate;
    const endDate =
      dto.endDate === undefined
        ? existing.endDate
        : dto.endDate == null || dto.endDate === ''
          ? null
          : parseCalendarDateInput(dto.endDate);

    if (endDate && endDate < startDate) {
      throw new BadRequestException('La fecha de fin no puede ser anterior al inicio.');
    }

    if (dto.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.buildingId, deletedAt: null },
        select: { id: true },
      });
      if (!building) throw new NotFoundException('Edificio no encontrado');
    }

    const updated = await this.prisma.fixedExpense.update({
      where: { id },
      data: {
        ...(dto.concept != null ? { concept: dto.concept.trim() } : {}),
        ...(dto.amount != null ? { amount: new Prisma.Decimal(dto.amount) } : {}),
        ...(dto.startDate != null ? { startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate } : {}),
        ...(dto.buildingId !== undefined ? { buildingId: dto.buildingId } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
      include: { building: { select: { id: true, name: true } } },
    });
    return this.serialize(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.fixedExpense.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Gasto fijo no encontrado');
    await this.prisma.fixedExpense.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Gasto fijo eliminado' };
  }
}
