import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { WorkOrderStatus, WorkOrderType } from '@prisma/client';
import { calendarDateFromInstant, endOfStoredCalendarDateInBusinessTz, TASK_CATEGORY_UNCATEGORIZED } from '@steam-genie/shared-constants';
import { snapshotEventualTasks } from '../../common/work-order-snapshot';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { QueryWorkOrdersDto } from './dto/query-work-orders.dto';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto';
import { RejectWorkOrderDto } from './dto/reject-work-order.dto';
import { CreateCheckoutCleaningDto } from './dto/create-checkout-cleaning.dto';
import { CreateAdditionalRequestDto } from './dto/create-additional-request.dto';
import { WORK_ORDER_LIST_SELECT } from './work-order-list.select';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '@steam-genie/shared-types';

const EXTERNAL_VIEWER_ROLES = new Set(['client', 'provider']);
const EXTERNAL_VIEWER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.ACCEPTED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.COMPLETED,
];

const WO_DETAIL_INCLUDE = {
  building: { select: { id: true, name: true } },
  floor: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true } },
  subzone: { select: { id: true, name: true } },
  reservation: {
    select: {
      id: true, externalId: true, guestName: true,
      checkinAt: true, checkoutAt: true, status: true,
      floor: { select: { id: true, name: true } },
      zone: { select: { id: true, name: true } },
      subzone: { select: { id: true, name: true } },
    },
  },
  assignments: {
    select: {
      id: true, userId: true, status: true,
      respondedAt: true, rejectionNote: true,
    },
  },
  workOrderTasks: {
    select: {
      id: true, taskId: true, nameSnapshot: true,
      requiresPhotoSnapshot: true, allowsObservationSnapshot: true,
      requiresRejectionReasonSnapshot: true, sortOrder: true,
      task: { select: { zoneId: true, subzoneId: true } },
      customFieldSnapshots: {
        select: {
          id: true, labelSnapshot: true, fieldType: true,
          isRequired: true, showInReport: true, sortOrder: true,
          optionSnapshots: {
            select: { id: true, labelSnapshot: true, sortOrder: true },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  serviceExecutions: {
    select: {
      id: true, status: true, startedAt: true, completedAt: true,
      participants: {
        select: { id: true, userId: true, joinedAt: true },
      },
    },
  },
} as const;

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── LIST ─────────────────────────────────────────────────────────────────

  async findAll(query: QueryWorkOrdersDto, user?: AuthUser) {
    const { page = 1, limit = 20, buildingId, status, type, date, assignedTo, sortDir } = query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };
    const isExternalViewer = user ? EXTERNAL_VIEWER_ROLES.has(user.primaryRole) : false;

    if (isExternalViewer) {
      where.type = WorkOrderType.CHECKOUT_CLEANING;
      where.status = status
        ? { in: EXTERNAL_VIEWER_STATUSES.filter((s) => s === status) }
        : { in: EXTERNAL_VIEWER_STATUSES };
      if (status && !EXTERNAL_VIEWER_STATUSES.includes(status as WorkOrderStatus)) {
        return { data: [], total: 0, page, limit, pages: 0 };
      }
    } else {
      if (buildingId) where.buildingId = buildingId;
      if (status) where.status = status;
      if (type) where.type = type;
    }

    if (date) {
      const d = new Date(date);
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);
      where.scheduledDate = { gte: d, lt: next };
    }

    let effectiveAssignedTo = assignedTo;
    if (user) {
      if (isExternalViewer) {
        const scopedBuildingIds = await this.getUserScopedBuildingIds(user.id);
        if (scopedBuildingIds.length === 0) {
          return { data: [], total: 0, page, limit, pages: 0 };
        }
        if (buildingId) {
          if (!scopedBuildingIds.includes(buildingId)) {
            return { data: [], total: 0, page, limit, pages: 0 };
          }
          where.buildingId = buildingId;
        } else {
          where.buildingId = { in: scopedBuildingIds };
        }
      } else {
        const globalStaff = await this.hasGlobalStaffAccess(user.id);
        if (!globalStaff) {
          const staffBuildingIds = await this.getStaffBuildingIds(user.id);
          if (staffBuildingIds.length > 0) {
            if (buildingId) {
              if (!staffBuildingIds.includes(buildingId)) {
                return { data: [], total: 0, page, limit, pages: 0 };
              }
            } else {
              where.buildingId = { in: staffBuildingIds };
            }
          } else {
            effectiveAssignedTo = effectiveAssignedTo ?? user.id;
          }
        }
      }
    }

    if (effectiveAssignedTo) {
      where.assignments = {
        some: {
          userId: effectiveAssignedTo,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
      };
    }

    const scheduleOrder = sortDir === 'desc' ? 'desc' : 'asc';

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { scheduledDate: scheduleOrder },
          { scheduledTime: scheduleOrder },
          { createdAt: scheduleOrder },
        ],
        select: WORK_ORDER_LIST_SELECT,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── CREATE CHECKOUT CLEANING (manual, sin reserva) ───────────────────────

  async createCheckoutCleaning(dto: CreateCheckoutCleaningDto, createdById: string) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is invalid');
    }

    const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : null;
    if (deadlineAt && Number.isNaN(deadlineAt.getTime())) {
      throw new BadRequestException('deadlineAt is invalid');
    }
    if (deadlineAt && deadlineAt <= scheduledAt) {
      throw new BadRequestException('deadlineAt must be after scheduledAt');
    }

    await this.validateHierarchy(dto.buildingId, dto.floorId, dto.zoneId);

    const selected = [...new Set(dto.categoryIds ?? [])];
    const includeUncategorized = selected.includes(TASK_CATEGORY_UNCATEGORIZED);
    const categoryIds = selected.filter((id) => id !== TASK_CATEGORY_UNCATEGORIZED);
    const hasCategoryFilter = selected.length > 0;

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const invalidIds = categoryIds.filter((id) => !uuidRe.test(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException('Una o más categorías son inválidas.');
    }

    if (hasCategoryFilter && categoryIds.length > 0) {
      const availableCategories = await this.findCategoriesUsedByEventualTasks(
        dto.buildingId,
        dto.zoneId,
      );
      const availableIds = new Set(availableCategories.map((c) => c.id));
      const unknown = categoryIds.filter((id) => !availableIds.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException(
          'Una o más categorías no tienen tareas eventuales en esta zona.',
        );
      }
    }

    const [zone, eventualTasks] = await Promise.all([
      this.prisma.zone.findFirst({
        where: { id: dto.zoneId },
        select: { name: true },
      }),
      this.findEventualTasksForZone(
        dto.buildingId,
        dto.zoneId,
        hasCategoryFilter
          ? { categoryIds, includeUncategorized }
          : undefined,
      ),
    ]);
    const hasNoTasks = eventualTasks.length === 0;

    const title = dto.title?.trim() || `Limpieza checkout – ${zone?.name ?? dto.zoneId}`;
    const scheduledDate = calendarDateFromInstant(scheduledAt);

    const result = await this.prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.create({
        data: {
          type: WorkOrderType.CHECKOUT_CLEANING,
          reservationId: null,
          buildingId: dto.buildingId,
          floorId: dto.floorId,
          zoneId: dto.zoneId,
          subzoneId: null,
          title,
          description: dto.description?.trim() || null,
          scheduledDate,
          scheduledTime: scheduledAt,
          deadlineAt,
          status: WorkOrderStatus.UNASSIGNED,
          createdById,
        },
      });

      await snapshotEventualTasks(tx, workOrder.id, eventualTasks);

      return { workOrder, taskCount: eventualTasks.length };
    });

    return {
      ...result,
      warning: hasNoTasks
        ? hasCategoryFilter
          ? 'No hay tareas EVENTUAL activas para el filtro de categorías seleccionado en esta zona ni sus subzonas'
          : 'No hay tareas EVENTUAL configuradas para esta zona ni sus subzonas'
        : undefined,
    };
  }

  // ─── CREATE ADDITIONAL REQUEST (cliente) ──────────────────────────────────

  async createAdditionalRequest(dto: CreateAdditionalRequestDto, createdById: string) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is invalid');
    }

    const deadlineAt = dto.deadlineAt ? new Date(dto.deadlineAt) : null;
    if (deadlineAt && Number.isNaN(deadlineAt.getTime())) {
      throw new BadRequestException('deadlineAt is invalid');
    }
    if (deadlineAt && deadlineAt <= scheduledAt) {
      throw new BadRequestException('deadlineAt must be after scheduledAt');
    }

    const hasAccess = await this.prisma.userBuildingRole.findFirst({
      where: { userId: createdById, buildingId: dto.buildingId },
    });
    if (!hasAccess) {
      throw new ForbiddenException('No tenés acceso a este edificio.');
    }

    await this.validateHierarchy(dto.buildingId, dto.floorId, dto.zoneId);

    const subzones = await this.prisma.subzone.findMany({
      where: { zoneId: dto.zoneId, buildingId: dto.buildingId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (subzones.length > 0) {
      if (!dto.subzoneId) {
        throw new BadRequestException(
          'Esta zona tiene subzonas. Debés elegir una subzona específica.',
        );
      }
      const subzone = subzones.find((s) => s.id === dto.subzoneId);
      if (!subzone) {
        throw new BadRequestException('La subzona no pertenece a la zona seleccionada.');
      }
    } else if (dto.subzoneId) {
      throw new BadRequestException('Esta zona no tiene subzonas.');
    }

    const [zone, subzone, eventualTasks] = await Promise.all([
      this.prisma.zone.findFirst({
        where: { id: dto.zoneId },
        select: { name: true },
      }),
      dto.subzoneId
        ? this.prisma.subzone.findFirst({
            where: { id: dto.subzoneId },
            select: { name: true },
          })
        : Promise.resolve(null),
      this.findEventualTasksForLocation(dto.buildingId, dto.zoneId, dto.subzoneId),
    ]);

    const locationLabel = subzone?.name ?? zone?.name ?? dto.zoneId;
    const title = dto.title?.trim() || `Petición de servicio – ${locationLabel}`;
    const scheduledDate = calendarDateFromInstant(scheduledAt);

    const result = await this.prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.create({
        data: {
          type: WorkOrderType.ADDITIONAL_REQUEST,
          reservationId: null,
          buildingId: dto.buildingId,
          floorId: dto.floorId,
          zoneId: dto.zoneId,
          subzoneId: dto.subzoneId ?? null,
          title,
          description: dto.description.trim(),
          scheduledDate,
          scheduledTime: scheduledAt,
          deadlineAt,
          status: WorkOrderStatus.UNASSIGNED,
          createdById,
        },
      });

      await snapshotEventualTasks(tx, workOrder.id, eventualTasks);

      return { workOrder, taskCount: eventualTasks.length };
    });

    return {
      ...result,
      warning: eventualTasks.length === 0
        ? 'No hay tareas EVENTUAL configuradas para esta ubicación'
        : undefined,
    };
  }

  // ─── GET ONE ──────────────────────────────────────────────────────────────

  async findOne(id: string, user?: AuthUser) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, deletedAt: null },
      include: WO_DETAIL_INCLUDE,
    });
    if (!wo) throw new NotFoundException('Work order not found');

    if (user) {
      if (EXTERNAL_VIEWER_ROLES.has(user.primaryRole)) {
        if (wo.type !== WorkOrderType.CHECKOUT_CLEANING) {
          throw new ForbiddenException('No tenés acceso a este servicio.');
        }
        if (!EXTERNAL_VIEWER_STATUSES.includes(wo.status)) {
          throw new ForbiddenException('Este servicio no está disponible para consulta.');
        }
        const scopedBuildingIds = await this.getUserScopedBuildingIds(user.id);
        if (!scopedBuildingIds.includes(wo.buildingId)) {
          throw new ForbiddenException('No tenés acceso a servicios de este edificio.');
        }
      } else {
        const globalStaff = await this.hasGlobalStaffAccess(user.id);
        if (!globalStaff) {
          const staffBuildingIds = await this.getStaffBuildingIds(user.id);
          if (staffBuildingIds.length > 0) {
            if (!staffBuildingIds.includes(wo.buildingId)) {
              throw new ForbiddenException('No tenés acceso a servicios de este edificio.');
            }
          } else {
            const hasAssignment = wo.assignments.some(
              (assignment) =>
                assignment.userId === user.id &&
                (assignment.status === 'PENDING' || assignment.status === 'ACCEPTED'),
            );
            if (!hasAssignment) {
              throw new ForbiddenException('No tenés asignado este servicio.');
            }
          }
        }
      }
    }

    return wo;
  }

  // ─── ASSIGN ───────────────────────────────────────────────────────────────

  async assign(id: string, dto: AssignWorkOrderDto) {
    const wo = await this.assertWorkOrderExists(id);

    if (wo.status === WorkOrderStatus.IN_PROGRESS || wo.status === WorkOrderStatus.COMPLETED) {
      throw new ConflictException(`Cannot assign a work order with status ${wo.status}`);
    }

    // Validate all users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds }, deletedAt: null },
      select: { id: true },
    });
    if (users.length !== dto.userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    const notifiedUserIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.workOrderAssignment.findMany({
        where: {
          workOrderId: id,
          userId: { in: dto.userIds },
        },
        select: { id: true, userId: true, status: true },
      });

      const assignmentsByUser = new Map<string, typeof existing>();
      for (const row of existing) {
        const list = assignmentsByUser.get(row.userId) ?? [];
        list.push(row);
        assignmentsByUser.set(row.userId, list);
      }

      const toCreate: string[] = [];

      for (const userId of dto.userIds) {
        const userAssignments = assignmentsByUser.get(userId) ?? [];
        const active = userAssignments.find(
          (row) => row.status === 'PENDING' || row.status === 'ACCEPTED',
        );
        if (active) continue;

        const rejected = userAssignments.find((row) => row.status === 'REJECTED');
        if (rejected) {
          await tx.workOrderAssignment.update({
            where: { id: rejected.id },
            data: {
              status: 'PENDING',
              rejectionReasonId: null,
              rejectionNote: null,
              respondedAt: null,
            },
          });
          notifiedUserIds.push(userId);
        } else {
          toCreate.push(userId);
        }
      }

      if (toCreate.length > 0) {
        await tx.workOrderAssignment.createMany({
          data: toCreate.map((userId) => ({
            workOrderId: id,
            userId,
            status: 'PENDING',
          })),
        });
        notifiedUserIds.push(...toCreate);
      }

      if (wo.status === WorkOrderStatus.UNASSIGNED) {
        await tx.workOrder.update({
          where: { id },
          data: { status: WorkOrderStatus.ASSIGNED },
        });
      }
    });

    if (notifiedUserIds.length > 0) {
      const assigned = await this.findOneForList(id);
      void this.notificationsService
        .notifyWorkOrderAssigned({
          workOrderId: assigned.id,
          title: assigned.title,
          buildingName: assigned.building.name,
          userIds: notifiedUserIds,
        })
        .catch(() => undefined);
    }

    return this.findOneForList(id);
  }

  private async findOneForList(id: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, deletedAt: null },
      select: WORK_ORDER_LIST_SELECT,
    });
    if (!wo) throw new NotFoundException('Work order not found');
    return wo;
  }

  // ─── ACCEPT ───────────────────────────────────────────────────────────────

  async accept(id: string, user: AuthUser) {
    const wo = await this.assertWorkOrderExists(id);
    this.assertWorkOrderNotExpired(wo);

    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: { workOrderId: id, userId: user.id, status: 'PENDING' },
    });
    if (!assignment) {
      throw new ForbiddenException('No pending assignment found for this user');
    }

    await this.prisma.$transaction([
      this.prisma.workOrderAssignment.update({
        where: { id: assignment.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      this.prisma.workOrder.update({
        where: { id },
        data: { status: WorkOrderStatus.ACCEPTED },
      }),
    ]);

    return this.findOne(id);
  }

  // ─── REJECT ───────────────────────────────────────────────────────────────

  async reject(id: string, dto: RejectWorkOrderDto, user: AuthUser) {
    await this.assertWorkOrderExists(id);

    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: { workOrderId: id, userId: user.id, status: 'PENDING' },
    });
    if (!assignment) {
      throw new ForbiddenException('No pending assignment found for this user');
    }

    // Validate rejectionReasonId if provided
    if (dto.rejectionReasonId) {
      const reason = await this.prisma.rejectionReason.findFirst({
        where: { id: dto.rejectionReasonId, type: 'SERVICE_REJECTION', isActive: true },
      });
      if (!reason) throw new NotFoundException('Rejection reason not found or invalid type');
    }

    await this.prisma.workOrderAssignment.update({
      where: { id: assignment.id },
      data: {
        status: 'REJECTED',
        rejectionReasonId: dto.rejectionReasonId ?? null,
        rejectionNote: dto.rejectionNote ?? null,
        respondedAt: new Date(),
      },
    });

    // If no more PENDING/ACCEPTED assignments → revert WO to UNASSIGNED
    const remaining = await this.prisma.workOrderAssignment.count({
      where: { workOrderId: id, status: { in: ['PENDING', 'ACCEPTED'] } },
    });
    if (remaining === 0) {
      await this.prisma.workOrder.update({
        where: { id },
        data: { status: WorkOrderStatus.UNASSIGNED },
      });
    }

    return this.findOne(id);
  }

  // ─── START ────────────────────────────────────────────────────────────────

  async start(id: string, user: AuthUser) {
    const wo = await this.assertWorkOrderExists(id);

    // Verify user has ACCEPTED assignment OR is admin/manager with building role
    const hasAccepted = await this.prisma.workOrderAssignment.findFirst({
      where: { workOrderId: id, userId: user.id, status: 'ACCEPTED' },
    });
    const hasManagerRole = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [{ buildingId: null }, { buildingId: wo.buildingId }],
      },
    });
    if (!hasAccepted && !hasManagerRole) {
      throw new ForbiddenException(
        'You must have an ACCEPTED assignment or a manager/admin role in this building',
      );
    }

    // Require active attendance in this building
    const now = new Date();
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        userId: user.id,
        buildingId: wo.buildingId,
        checkOutAt: null,
        checkInAt: { lte: now },
        deletedAt: null,
      },
    });
    if (!attendance) {
      throw new ForbiddenException(
        'Active attendance record required in this building to start a work order',
      );
    }

    if (wo.status === WorkOrderStatus.COMPLETED) {
      throw new ConflictException('Work order is already completed');
    }

    if (
      wo.status === WorkOrderStatus.ACCEPTED ||
      wo.status === WorkOrderStatus.ASSIGNED
    ) {
      this.assertWorkOrderNotExpired(wo);
    }

    // Check if ServiceExecution already exists (concurrent /start protection via @@unique)
    const existing = await this.prisma.serviceExecution.findFirst({
      where: { workOrderId: id },
    });
    if (existing) {
      // Already started — join as participant if not already
      const alreadyParticipant = await this.prisma.serviceExecutionParticipant.findFirst({
        where: { serviceExecutionId: existing.id, userId: user.id },
      });
      if (alreadyParticipant) {
        throw new ConflictException('You are already a participant in this service execution');
      }
      await this.prisma.serviceExecutionParticipant.create({
        data: {
          serviceExecutionId: existing.id,
          userId: user.id,
          attendanceId: attendance.id,
          joinedAt: now,
        },
      });
      return this.findOne(id);
    }

    // Create ServiceExecution + update WO status
    await this.prisma.$transaction(async (tx) => {
      const se = await tx.serviceExecution.create({
        data: {
          workOrderId: id,
          attendanceId: attendance.id,
          startedById: user.id,
          startedAt: now,
          status: 'IN_PROGRESS',
        },
      });
      await tx.serviceExecutionParticipant.create({
        data: {
          serviceExecutionId: se.id,
          userId: user.id,
          attendanceId: attendance.id,
          joinedAt: now,
        },
      });
      await tx.workOrder.update({
        where: { id },
        data: { status: WorkOrderStatus.IN_PROGRESS, startedAt: now },
      });
    });

    return this.findOne(id);
  }

  // ─── COMPLETE ─────────────────────────────────────────────────────────────

  async complete(id: string, user: AuthUser) {
    const wo = await this.assertWorkOrderExists(id);

    if (wo.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new ConflictException(
        `Work order cannot be completed from status ${wo.status}`,
      );
    }

    const serviceExecution = await this.prisma.serviceExecution.findFirst({
      where: { workOrderId: id },
      include: { participants: { select: { userId: true } } },
    });
    if (!serviceExecution) {
      throw new ConflictException('No active service execution found for this work order');
    }

    // User must be a participant OR have manager/admin role for the building
    const isParticipant = serviceExecution.participants.some((p) => p.userId === user.id);
    if (!isParticipant) {
      const hasManagerRole = await this.prisma.userBuildingRole.findFirst({
        where: {
          userId: user.id,
          role: { name: { in: ['admin', 'manager'] } },
          OR: [{ buildingId: null }, { buildingId: wo.buildingId }],
        },
      });
      if (!hasManagerRole) {
        throw new ForbiddenException(
          'You must be a participant in this execution or have a manager/admin role to complete it',
        );
      }
    }

    // ── Checklist validation ─────────────────────────────────────────────────
    const workOrderTasks = await this.prisma.workOrderTask.findMany({
      where: { workOrderId: id },
      select: {
        id: true,
        nameSnapshot: true,
        requiresRejectionReasonSnapshot: true,
        requiresPhotoSnapshot: true,
        taskExecutions: {
          where: { serviceExecutionId: serviceExecution.id },
          select: {
            id: true,
            status: true,
            rejectionReasonId: true,
            _count: { select: { photos: { where: { deletedAt: null } } } },
          },
        },
      },
    });

    const unexecutedTasks = workOrderTasks.filter(
      (wot) => wot.taskExecutions.length === 0,
    );
    if (unexecutedTasks.length > 0) {
      throw new ConflictException(
        `${unexecutedTasks.length} tarea(s) sin ejecutar: ` +
        unexecutedTasks.map((t) => `"${t.nameSnapshot}"`).join(', ') +
        '. Marcá todas las tareas antes de completar el servicio.',
      );
    }

    for (const wot of workOrderTasks) {
      const exec = wot.taskExecutions[0];

      if (
        exec.status === 'NOT_DONE' &&
        wot.requiresRejectionReasonSnapshot &&
        !exec.rejectionReasonId
      ) {
        throw new UnprocessableEntityException(
          `Task "${wot.nameSnapshot}" is marked NOT_DONE but requires a rejection reason.`,
        );
      }

      if (
        wot.requiresPhotoSnapshot &&
        exec.status === 'DONE' &&
        exec._count.photos === 0
      ) {
        throw new ConflictException(
          `La tarea "${wot.nameSnapshot}" requiere al menos una foto para marcarse como hecha.`,
        );
      }
    }

    // ── Close service execution and work order ────────────────────────────────
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.serviceExecution.update({
        where: { id: serviceExecution.id },
        data: { status: 'COMPLETED', completedAt: now },
      }),
      this.prisma.workOrder.update({
        where: { id },
        data: { status: WorkOrderStatus.COMPLETED, completedAt: now },
      }),
    ]);

    return this.findOne(id);
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  async remove(id: string, user: AuthUser) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, buildingId: true, status: true },
    });
    if (!wo) throw new NotFoundException('Work order not found');

    const globalStaff = await this.hasGlobalStaffAccess(user.id);
    if (!globalStaff) {
      const staffBuildingIds = await this.getStaffBuildingIds(user.id);
      if (!staffBuildingIds.includes(wo.buildingId)) {
        throw new ForbiddenException('No tenés acceso a servicios de este edificio.');
      }
    }

    if (wo.status === WorkOrderStatus.IN_PROGRESS) {
      throw new ConflictException('No se puede eliminar un servicio en curso.');
    }
    if (wo.status === WorkOrderStatus.COMPLETED) {
      throw new ConflictException('No se puede eliminar un servicio completado.');
    }

    await this.prisma.workOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Work order deleted' };
  }

  /**
   * Hard-delete de TODOS los servicios eventuales y dependencias
   * (ejecuciones, asignaciones, snapshots, gastos, ítems de comisión).
   * No toca tareas maestras ni instancias periódicas.
   */
  async purgeAll(confirm: string) {
    if (confirm !== 'DELETE_ALL_WORK_ORDERS') {
      throw new BadRequestException(
        'Confirmación inválida. Enviá confirm=DELETE_ALL_WORK_ORDERS para vaciar todos los servicios.',
      );
    }

    const deleted = await this.prisma.$transaction(
      async (tx) => {
        const totalBefore = await tx.workOrder.count();

        const [woTasks, serviceExecs] = await Promise.all([
          tx.workOrderTask.findMany({ select: { id: true } }),
          tx.serviceExecution.findMany({ select: { id: true } }),
        ]);
        const woTaskIds = woTasks.map((t) => t.id);
        const seIds = serviceExecs.map((s) => s.id);

        const taskExecFilters = [
          ...(woTaskIds.length ? [{ workOrderTaskId: { in: woTaskIds } }] : []),
          ...(seIds.length ? [{ serviceExecutionId: { in: seIds } }] : []),
        ];
        const taskExecs = taskExecFilters.length
          ? await tx.taskExecutionRecord.findMany({
              where: { OR: taskExecFilters },
              select: { id: true },
            })
          : [];
        const taskExecIds = taskExecs.map((t) => t.id);

        // 1) Ejecuciones de checklist de servicios
        if (taskExecIds.length) {
          await tx.taskPhoto.deleteMany({ where: { taskExecutionId: { in: taskExecIds } } });
          await tx.taskExecutionFieldValue.deleteMany({
            where: { taskExecutionId: { in: taskExecIds } },
          });
          await tx.taskExecutionRecord.deleteMany({ where: { id: { in: taskExecIds } } });
        }

        // 2) Ejecuciones de servicio
        if (seIds.length) {
          await tx.serviceExecutionParticipant.deleteMany({
            where: { serviceExecutionId: { in: seIds } },
          });
          await tx.serviceExecution.deleteMany({ where: { id: { in: seIds } } });
        }

        // 3) Snapshots de tareas en WO
        if (woTaskIds.length) {
          const woFields = await tx.workOrderTaskCustomField.findMany({
            where: { workOrderTaskId: { in: woTaskIds } },
            select: { id: true },
          });
          const woFieldIds = woFields.map((f) => f.id);
          if (woFieldIds.length) {
            await tx.workOrderTaskCustomFieldOption.deleteMany({
              where: { workOrderTaskFieldId: { in: woFieldIds } },
            });
            await tx.taskExecutionFieldValue.deleteMany({
              where: { snapshotFieldId: { in: woFieldIds } },
            });
            await tx.workOrderTaskCustomField.deleteMany({
              where: { id: { in: woFieldIds } },
            });
          }
          await tx.workOrderTask.deleteMany({ where: { id: { in: woTaskIds } } });
        }

        // 4) Asignaciones, gastos, comisiones, logs
        await tx.workOrderAssignment.deleteMany({});
        await tx.workOrderExpense.deleteMany({});
        await tx.commissionSettlementItem.deleteMany({});
        await tx.integrationInboundLog.updateMany({
          where: { relatedWorkOrderId: { not: null } },
          data: { relatedWorkOrderId: null },
        });

        // 5) Servicios
        const result = await tx.workOrder.deleteMany({});

        return { totalBefore, deletedWorkOrders: result.count };
      },
      { timeout: 180_000 },
    );

    return {
      message: 'All work orders purged',
      ...deleted,
    };
  }

  private async assertWorkOrderExists(id: string) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        buildingId: true,
        scheduledDate: true,
        deadlineAt: true,
      },
    });
    if (!wo) throw new NotFoundException('Work order not found');
    return wo;
  }

  private assertWorkOrderNotExpired(wo: {
    status: WorkOrderStatus;
    scheduledDate: Date | null;
    deadlineAt: Date | null;
  }) {
    const expirable = new Set<WorkOrderStatus>([
      WorkOrderStatus.ASSIGNED,
      WorkOrderStatus.ACCEPTED,
    ]);
    if (!expirable.has(wo.status)) return;

    const now = new Date();
    if (wo.deadlineAt && wo.deadlineAt.getTime() < now.getTime()) {
      throw new UnprocessableEntityException('Work order has expired');
    }
    if (!wo.deadlineAt && wo.scheduledDate) {
      const endOfDay = endOfStoredCalendarDateInBusinessTz(wo.scheduledDate);
      if (endOfDay.getTime() < now.getTime()) {
        throw new UnprocessableEntityException('Work order has expired');
      }
    }
  }

  /** Admin/manager con rol global (cualquier edificio). */
  private async hasGlobalStaffAccess(userId: string): Promise<boolean> {
    return !!(await this.prisma.userBuildingRole.findFirst({
      where: {
        userId,
        buildingId: null,
        role: { name: { in: ['admin', 'manager'] } },
      },
    }));
  }

  /** Edificios donde el usuario es admin o encargado (rol acotado). */
  private async getStaffBuildingIds(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userBuildingRole.findMany({
      where: {
        userId,
        buildingId: { not: null },
        role: { name: { in: ['admin', 'manager'] } },
      },
      select: { buildingId: true },
    });

    return [
      ...new Set(
        assignments
          .map((item) => item.buildingId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  private async validateHierarchy(buildingId: string, floorId: string, zoneId: string) {
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
  }

  /** Edificios habilitados para cliente/proveedor (rol acotado por edificio). */
  private async getUserScopedBuildingIds(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userBuildingRole.findMany({
      where: { userId, buildingId: { not: null } },
      select: { buildingId: true },
    });

    return [
      ...new Set(
        assignments
          .map((item) => item.buildingId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  private async findEventualTasksForLocation(
    buildingId: string,
    zoneId: string,
    subzoneId?: string,
  ) {
    if (subzoneId) {
      return this.prisma.task.findMany({
        where: {
          buildingId,
          zoneId,
          subzoneId,
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
    }

    return this.findEventualTasksForZone(buildingId, zoneId);
  }

  private async findEventualTasksForZone(
    buildingId: string,
    zoneId: string,
    categoryFilter?: { categoryIds: string[]; includeUncategorized: boolean },
  ) {
    const subzones = await this.prisma.subzone.findMany({
      where: { zoneId, buildingId, deletedAt: null },
      select: { id: true },
    });
    const subzoneIds = subzones.map((s) => s.id);

    const locationOr = [
      { subzoneId: null },
      ...(subzoneIds.length > 0 ? [{ subzoneId: { in: subzoneIds } }] : []),
    ];

    const categoryOr =
      categoryFilter &&
      (categoryFilter.categoryIds.length > 0 || categoryFilter.includeUncategorized)
        ? [
            ...(categoryFilter.categoryIds.length > 0
              ? [{ categoryId: { in: categoryFilter.categoryIds } }]
              : []),
            ...(categoryFilter.includeUncategorized ? [{ categoryId: null }] : []),
          ]
        : null;

    return this.prisma.task.findMany({
      where: {
        buildingId,
        zoneId,
        frequency: 'EVENTUAL',
        isActive: true,
        deletedAt: null,
        AND: [
          { OR: locationOr },
          ...(categoryOr ? [{ OR: categoryOr }] : []),
        ],
      },
      include: {
        customFields: {
          orderBy: { sortOrder: 'asc' as const },
          include: {
            options: { orderBy: { sortOrder: 'asc' as const } },
          },
        },
      },
      orderBy: [{ subzoneId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async findCategoriesUsedByEventualTasks(buildingId: string, zoneId: string) {
    const subzones = await this.prisma.subzone.findMany({
      where: { zoneId, buildingId, deletedAt: null },
      select: { id: true },
    });
    const subzoneIds = subzones.map((s) => s.id);

    const rows = await this.prisma.task.findMany({
      where: {
        buildingId,
        zoneId,
        frequency: 'EVENTUAL',
        isActive: true,
        deletedAt: null,
        categoryId: { not: null },
        OR: [
          { subzoneId: null },
          ...(subzoneIds.length > 0 ? [{ subzoneId: { in: subzoneIds } }] : []),
        ],
      },
      select: { categoryId: true },
      distinct: ['categoryId'],
    });

    const ids = rows.map((r) => r.categoryId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return [];

    return this.prisma.taskCategory.findMany({
      where: { id: { in: ids }, deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}
