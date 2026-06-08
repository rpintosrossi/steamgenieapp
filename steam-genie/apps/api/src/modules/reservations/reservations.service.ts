import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ReservationSource, WorkOrderType, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { QueryReservationsDto } from './dto/query-reservations.dto';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── LIST ─────────────────────────────────────────────────────────────────

  async findAll(query: QueryReservationsDto) {
    const { page = 1, limit = 20, buildingId, zoneId, subzoneId, status, from, to } = query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (buildingId) where.buildingId = buildingId;
    if (zoneId) where.zoneId = zoneId;
    if (subzoneId) where.subzoneId = subzoneId;
    if (status) where.status = status;
    if (from || to) {
      where.checkoutAt = {};
      if (from) where.checkoutAt.gte = new Date(from);
      if (to) where.checkoutAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { checkoutAt: 'asc' },
        select: {
          id: true, buildingId: true, floorId: true, zoneId: true, subzoneId: true,
          externalId: true, guestName: true, checkinAt: true, checkoutAt: true,
          status: true, source: true, createdAt: true, updatedAt: true,
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── GET ONE ──────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id },
      include: {
        workOrders: {
          where: { deletedAt: null },
          select: {
            id: true, type: true, status: true, scheduledDate: true,
            scheduledTime: true, deadlineAt: true, title: true, createdAt: true,
          },
        },
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
  }

  // ─── GET WORK ORDERS ──────────────────────────────────────────────────────

  async findWorkOrders(id: string) {
    await this.assertReservationExists(id);
    return this.prisma.workOrder.findMany({
      where: { reservationId: id, deletedAt: null },
      include: {
        assignments: { select: { id: true, userId: true, status: true, respondedAt: true } },
        workOrderTasks: {
          select: {
            id: true, nameSnapshot: true, requiresPhotoSnapshot: true,
            allowsObservationSnapshot: true, requiresRejectionReasonSnapshot: true, sortOrder: true,
            customFieldSnapshots: {
              select: {
                id: true, labelSnapshot: true, fieldType: true, isRequired: true,
                showInReport: true, sortOrder: true,
                optionSnapshots: { select: { id: true, labelSnapshot: true, sortOrder: true } },
              },
            },
          },
        },
      },
    });
  }

  // ─── CREATE (transactional) ───────────────────────────────────────────────

  async create(dto: CreateReservationDto, createdById: string) {
    // Validate dates
    const checkinAt = new Date(dto.checkinAt);
    const checkoutAt = new Date(dto.checkoutAt);
    if (isNaN(checkinAt.getTime())) throw new BadRequestException('checkinAt is invalid');
    if (isNaN(checkoutAt.getTime())) throw new BadRequestException('checkoutAt is invalid');
    if (checkoutAt <= checkinAt) throw new BadRequestException('checkoutAt must be after checkinAt');

    const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : null;
    if (deadlineAt && deadlineAt <= checkoutAt) {
      throw new BadRequestException('deadlineAt must be after checkoutAt');
    }

    // Validate hierarchy
    await this.validateHierarchy(dto.buildingId, dto.floorId, dto.zoneId, dto.subzoneId);

    // Find EVENTUAL tasks for this zone/subzone
    const eventualTasks = await this.prisma.task.findMany({
      where: {
        buildingId: dto.buildingId,
        zoneId: dto.zoneId,
        subzoneId: dto.subzoneId ?? null,
        frequency: 'EVENTUAL',
        isActive: true,
        deletedAt: null,
      },
      include: {
        customFields: {
          orderBy: { sortOrder: 'asc' as const },
          include: {
            options: { orderBy: { sortOrder: 'asc' as const } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const hasNoTasks = eventualTasks.length === 0;

    // Build WorkOrder title
    const zone = await this.prisma.zone.findFirst({
      where: { id: dto.zoneId },
      select: { name: true },
    });
    const woTitle = `Limpieza checkout – ${zone?.name ?? dto.zoneId}`;

    // Scheduled date = checkout date
    const scheduledDate = new Date(
      Date.UTC(checkoutAt.getUTCFullYear(), checkoutAt.getUTCMonth(), checkoutAt.getUTCDate()),
    );

    // ── Transaction ──────────────────────────────────────────────────────────
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Reservation
      const reservation = await tx.reservation.create({
        data: {
          buildingId: dto.buildingId,
          floorId: dto.floorId,
          zoneId: dto.zoneId,
          subzoneId: dto.subzoneId ?? null,
          externalId: dto.externalId ?? null,
          guestName: dto.guestName ?? null,
          checkinAt,
          checkoutAt,
          source: dto.source ?? ReservationSource.MANUAL,
        },
      });

      // 2. Create WorkOrder
      const workOrder = await tx.workOrder.create({
        data: {
          type: WorkOrderType.CHECKOUT_CLEANING,
          reservationId: reservation.id,
          buildingId: dto.buildingId,
          floorId: dto.floorId,
          zoneId: dto.zoneId,
          subzoneId: dto.subzoneId ?? null,
          title: woTitle,
          scheduledDate,
          scheduledTime: checkoutAt,
          deadlineAt,
          status: WorkOrderStatus.UNASSIGNED,
          createdById,
        },
      });

      // 3. Snapshot EVENTUAL tasks → work_order_tasks
      for (let i = 0; i < eventualTasks.length; i++) {
        const task = eventualTasks[i];
        const wot = await tx.workOrderTask.create({
          data: {
            workOrderId: workOrder.id,
            taskId: task.id,
            nameSnapshot: task.name,
            requiresPhotoSnapshot: task.requiresPhoto,
            allowsObservationSnapshot: task.allowsObservation,
            requiresRejectionReasonSnapshot: task.requiresRejectionReason,
            sortOrder: i,
          },
        });

        // 3a. Snapshot custom fields
        for (let fi = 0; fi < task.customFields.length; fi++) {
          const field = task.customFields[fi];
          const wotField = await tx.workOrderTaskCustomField.create({
            data: {
              workOrderTaskId: wot.id,
              originalFieldId: field.id,
              labelSnapshot: field.label,
              fieldType: field.fieldType,
              isRequired: field.isRequired,
              showInReport: field.showInReport,
              sortOrder: field.sortOrder,
            },
          });

          // 3b. Snapshot field options
          for (const opt of field.options) {
            await tx.workOrderTaskCustomFieldOption.create({
              data: {
                workOrderTaskFieldId: wotField.id,
                originalOptionId: opt.id,
                labelSnapshot: opt.label,
                sortOrder: opt.sortOrder,
              },
            });
          }
        }
      }

      return { reservation, workOrder, taskCount: eventualTasks.length };
    });

    return {
      ...result,
      warning: hasNoTasks
        ? 'No EVENTUAL tasks configured for this zone/subzone'
        : undefined,
    };
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateReservationDto) {
    const reservation = await this.assertReservationExists(id);

    // Block if WorkOrder is IN_PROGRESS or COMPLETED
    const blockingWO = await this.prisma.workOrder.findFirst({
      where: {
        reservationId: id,
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        deletedAt: null,
      },
    });
    if (blockingWO) {
      throw new ConflictException(
        'Cannot update reservation: associated work order is already in progress or completed',
      );
    }

    // Validate dates if both provided
    const checkinAt = dto.checkinAt ? new Date(dto.checkinAt) : reservation.checkinAt;
    const checkoutAt = dto.checkoutAt ? new Date(dto.checkoutAt) : reservation.checkoutAt;
    if (checkoutAt <= checkinAt) throw new BadRequestException('checkoutAt must be after checkinAt');

    if (dto.deadlineAt) {
      const deadlineAt = new Date(dto.deadlineAt);
      if (deadlineAt <= checkoutAt) throw new BadRequestException('deadlineAt must be after checkoutAt');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (dto.externalId !== undefined) data.externalId = dto.externalId;
    if (dto.guestName !== undefined) data.guestName = dto.guestName;
    if (dto.checkinAt) data.checkinAt = new Date(dto.checkinAt);
    if (dto.checkoutAt) data.checkoutAt = new Date(dto.checkoutAt);
    if (dto.deadlineAt) data.deadlineAt = new Date(dto.deadlineAt);

    return this.prisma.reservation.update({ where: { id }, data });
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private async assertReservationExists(id: string) {
    const r = await this.prisma.reservation.findFirst({ where: { id } });
    if (!r) throw new NotFoundException('Reservation not found');
    return r;
  }

  private async validateHierarchy(
    buildingId: string,
    floorId: string,
    zoneId: string,
    subzoneId?: string,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, deletedAt: null },
    });
    if (!building) throw new NotFoundException('Building not found');

    const floor = await this.prisma.floor.findFirst({
      where: { id: floorId, buildingId, deletedAt: null },
    });
    if (!floor) throw new NotFoundException('Floor not found or does not belong to this building');

    const zone = await this.prisma.zone.findFirst({
      where: { id: zoneId, buildingId, floorId, deletedAt: null },
    });
    if (!zone) throw new NotFoundException('Zone not found or does not belong to this floor');

    if (subzoneId) {
      const subzone = await this.prisma.subzone.findFirst({
        where: { id: subzoneId, zoneId, deletedAt: null },
      });
      if (!subzone) throw new NotFoundException('Subzone not found or does not belong to this zone');
    }
  }
}
