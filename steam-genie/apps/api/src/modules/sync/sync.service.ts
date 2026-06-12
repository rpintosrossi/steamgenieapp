import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { ServiceExecutionsService } from '../service-executions/service-executions.service';
import { TasksService } from '../tasks/tasks.service';
import { PrefetchQueryDto } from './dto/prefetch-query.dto';
import { SyncBatchDto, SyncOperationItemDto, SyncOperationType } from './dto/sync-batch.dto';
import type { AuthUser } from '@steam-genie/shared-types';

// ─── Result types ────────────────────────────────────────────────────────────

export interface SyncError {
  code: string;
  message: string;
}

export interface SyncOperationResult {
  clientOperationId: string;
  status: 'SUCCESS' | 'FAILED' | 'ALREADY_PROCESSED' | 'CONFLICT';
  serverEntityId: string | null;
  entityType: string;
  version: number | null;
  error: SyncError | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly serviceExecutionsService: ServiceExecutionsService,
    private readonly tasksService: TasksService,
  ) {}

  // ─── PREFETCH ─────────────────────────────────────────────────────────────

  /**
   * Returns the minimal dataset the mobile app needs to work offline
   * in a specific building.
   *
   * Cleaners see only their own work orders / executions.
   * Managers / admins see all work orders for the building.
   */
  async prefetch(query: PrefetchQueryDto, user: AuthUser) {
    const { buildingId } = query;

    // ── Validate building access via user_building_roles ─────────────────────
    const access = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        OR: [{ buildingId: null }, { buildingId }],
      },
    });
    if (!access) {
      throw new ForbiddenException('You do not have access to this building');
    }

    const isManagerOrAdmin = !!(await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: user.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [{ buildingId: null }, { buildingId }],
      },
    }));

    // ── Building ──────────────────────────────────────────────────────────────
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        gpsRadiusM: true,
      },
    });
    if (!building) throw new NotFoundException('Building not found or inactive');

    // ── Floors ────────────────────────────────────────────────────────────────
    const floors = await this.prisma.floor.findMany({
      where: { buildingId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, sortOrder: true },
    });

    // ── Zones ─────────────────────────────────────────────────────────────────
    const zones = await this.prisma.zone.findMany({
      where: { floor: { buildingId }, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, floorId: true },
    });

    // ── Subzones ──────────────────────────────────────────────────────────────
    const subzones = await this.prisma.subzone.findMany({
      where: { zone: { floor: { buildingId } }, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, zoneId: true },
    });

    // ── Work orders ───────────────────────────────────────────────────────────
    const woBaseWhere = {
      buildingId,
      deletedAt: null as null,
      status: {
        notIn: [
          WorkOrderStatus.COMPLETED,
          WorkOrderStatus.REJECTED,
        ],
      },
    };

    const workOrders = await this.prisma.workOrder.findMany({
      where: isManagerOrAdmin
        ? woBaseWhere
        : {
            ...woBaseWhere,
            assignments: {
              some: {
                userId: user.id,
                status: { in: ['PENDING', 'ACCEPTED'] as ('PENDING' | 'ACCEPTED')[] },
              },
            },
          },
      orderBy: { scheduledDate: 'asc' },
      select: {
        id: true,
        status: true,
        type: true,
        title: true,
        description: true,
        scheduledDate: true,
        deadlineAt: true,
        buildingId: true,
        floorId: true,
        zoneId: true,
        subzoneId: true,
        version: true,
        floor: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
        subzone: { select: { id: true, name: true } },
        reservation: {
          select: {
            guestName: true,
            checkinAt: true,
            checkoutAt: true,
            externalId: true,
            status: true,
            floor: { select: { id: true, name: true } },
            zone: { select: { id: true, name: true } },
            subzone: { select: { id: true, name: true } },
          },
        },
        workOrderTasks: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            nameSnapshot: true,
            sortOrder: true,
            requiresPhotoSnapshot: true,
            allowsObservationSnapshot: true,
            requiresRejectionReasonSnapshot: true,
            task: { select: { zoneId: true, subzoneId: true } },
          },
        },
        assignments: {
          select: { userId: true, status: true },
        },
      },
    });

    // ── Open service executions ───────────────────────────────────────────────
    const serviceExecutions = await this.prisma.serviceExecution.findMany({
      where: isManagerOrAdmin
        ? { status: 'IN_PROGRESS', workOrder: { buildingId } }
        : {
            status: 'IN_PROGRESS',
            participants: { some: { userId: user.id } },
          },
      select: {
        id: true,
        workOrderId: true,
        status: true,
        startedAt: true,
        participants: {
          select: { userId: true, joinedAt: true },
        },
      },
    });

    // ── Active attendance ─────────────────────────────────────────────────────
    const activeAttendance = await this.prisma.attendance.findFirst({
      where: { userId: user.id, checkOutAt: null, deletedAt: null },
      select: {
        id: true,
        buildingId: true,
        checkInAt: true,
        checkInGpsLat: true,
        checkInGpsLng: true,
        version: true,
      },
    });

    // ── Rejection reasons ─────────────────────────────────────────────────────
    const rejectionReasons = await this.prisma.rejectionReason.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { text: 'asc' },
      select: { id: true, text: true, type: true },
    });

    // ── Periodic tasks due today ───────────────────────────────────────────────
    // Return active non-EVENTUAL tasks for the building so the mobile can determine what is due.
    const periodicTasks = await this.prisma.task.findMany({
      where: {
        buildingId,
        isActive: true,
        deletedAt: null,
        frequency: { not: 'EVENTUAL' },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        frequency: true,
        zoneId: true,
        subzoneId: true,
        startDate: true,
      },
    });

    return {
      serverTime: new Date(),
      building,
      floors,
      zones,
      subzones,
      workOrders,
      serviceExecutions,
      activeAttendance,
      rejectionReasons,
      periodicTasks,
    };
  }

  // ─── BATCH ────────────────────────────────────────────────────────────────

  async processBatch(dto: SyncBatchDto, user: AuthUser, ip: string | undefined) {
    const results: SyncOperationResult[] = [];

    for (const op of dto.operations) {
      const result = await this.processOne(op, dto.deviceId, user, ip);
      results.push(result);
    }

    return {
      serverTime: new Date(),
      results,
    };
  }

  // ─── PRIVATE: process a single operation ──────────────────────────────────

  private async processOne(
    op: SyncOperationItemDto,
    deviceId: string,
    user: AuthUser,
    ip: string | undefined,
  ): Promise<SyncOperationResult> {
    // ── Idempotency check ─────────────────────────────────────────────────────
    const existing = await this.prisma.syncOperation.findUnique({
      where: { clientOperationId: op.clientOperationId },
    });
    if (existing) {
      return {
        clientOperationId: op.clientOperationId,
        status: 'ALREADY_PROCESSED',
        serverEntityId: existing.entityId ?? null,
        entityType: existing.entityType,
        version: null,
        error: null,
      };
    }

    // ── Version conflict check (entities that carry version) ─────────────────
    if (op.baseVersion !== undefined && op.entityId) {
      const conflict = await this.checkVersionConflict(
        op.operationType,
        op.entityId,
        op.baseVersion,
      );
      if (conflict) {
        await this.saveSyncOp(op, deviceId, user.id, {
          clientOperationId: op.clientOperationId,
          status: 'CONFLICT',
          serverEntityId: op.entityId,
          entityType: op.entityType,
          version: null,
          error: { code: 'VERSION_CONFLICT', message: conflict },
        });
        return {
          clientOperationId: op.clientOperationId,
          status: 'CONFLICT',
          serverEntityId: op.entityId,
          entityType: op.entityType,
          version: null,
          error: { code: 'VERSION_CONFLICT', message: conflict },
        };
      }
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    let result: SyncOperationResult;
    try {
      result = await this.dispatch(op, user, ip);
    } catch (error) {
      result = this.buildErrorResult(op, error);
    }

    // ── Persist log ───────────────────────────────────────────────────────────
    await this.saveSyncOp(op, deviceId, user.id, result);

    return result;
  }

  // ─── PRIVATE: version conflict ────────────────────────────────────────────

  private async checkVersionConflict(
    operationType: SyncOperationType,
    entityId: string,
    baseVersion: number,
  ): Promise<string | null> {
    if (
      operationType === SyncOperationType.START_WORK_ORDER ||
      operationType === SyncOperationType.COMPLETE_WORK_ORDER
    ) {
      const wo = await this.prisma.workOrder.findFirst({
        where: { id: entityId },
        select: { version: true },
      });
      if (wo && wo.version !== baseVersion) {
        return `Work order version mismatch: client=${baseVersion}, server=${wo.version}`;
      }
    }
    // TODO: Add version check for MARK_WORK_ORDER_TASK once ServiceExecution carries version
    return null;
  }

  // ─── PRIVATE: dispatch per operation type ────────────────────────────────

  private async dispatch(
    op: SyncOperationItemDto,
    user: AuthUser,
    ip: string | undefined,
  ): Promise<SyncOperationResult> {
    const p = op.payload;

    switch (op.operationType) {
      case SyncOperationType.CHECK_IN: {
        if (!p.buildingId || p.gpsLat === undefined || p.gpsLng === undefined) {
          throw new BadRequestException(
            'CHECK_IN payload requires: buildingId, gpsLat, gpsLng',
          );
        }
        const attendance = await this.attendanceService.checkIn(
          user,
          {
            buildingId: p.buildingId as string,
            gpsLat: Number(p.gpsLat),
            gpsLng: Number(p.gpsLng),
            deviceId: p.deviceId as string | undefined,
            clientOperationId: op.clientOperationId,
            occurredAt: op.occurredAt,
          },
          ip,
        );
        return {
          clientOperationId: op.clientOperationId,
          status: 'SUCCESS',
          serverEntityId: attendance.id,
          entityType: 'ATTENDANCE',
          version: (attendance as { version?: number }).version ?? null,
          error: null,
        };
      }

      case SyncOperationType.CHECK_OUT: {
        if (p.gpsLat === undefined || p.gpsLng === undefined) {
          throw new BadRequestException(
            'CHECK_OUT payload requires: gpsLat, gpsLng',
          );
        }
        const attendance = await this.attendanceService.checkOut(
          user,
          {
            gpsLat: Number(p.gpsLat),
            gpsLng: Number(p.gpsLng),
            deviceId: p.deviceId as string | undefined,
            occurredAt: op.occurredAt,
          },
          ip,
        );
        return {
          clientOperationId: op.clientOperationId,
          status: 'SUCCESS',
          serverEntityId: attendance.attendanceId,
          entityType: 'ATTENDANCE',
          version: null,
          error: null,
        };
      }

      case SyncOperationType.START_WORK_ORDER: {
        const workOrderId = (op.entityId ?? p.workOrderId) as string | undefined;
        if (!workOrderId) {
          throw new BadRequestException(
            'START_WORK_ORDER requires entityId (workOrderId)',
          );
        }
        const wo = await this.workOrdersService.start(workOrderId, user);
        const seId = (wo as { serviceExecutions?: Array<{ id: string }> })
          ?.serviceExecutions?.[0]?.id ?? null;
        return {
          clientOperationId: op.clientOperationId,
          status: 'SUCCESS',
          serverEntityId: seId ?? wo.id,
          entityType: seId ? 'SERVICE_EXECUTION' : 'WORK_ORDER',
          version: (wo as { version?: number }).version ?? null,
          error: null,
        };
      }

      case SyncOperationType.MARK_WORK_ORDER_TASK: {
        const serviceExecutionId = p.serviceExecutionId as string | undefined;
        const workOrderTaskId = p.workOrderTaskId as string | undefined;
        const status = p.status as string | undefined;
        if (!serviceExecutionId || !workOrderTaskId || !status) {
          throw new BadRequestException(
            'MARK_WORK_ORDER_TASK payload requires: serviceExecutionId, workOrderTaskId, status',
          );
        }
        const record = await this.serviceExecutionsService.markTask(
          serviceExecutionId,
          workOrderTaskId,
          {
            status: status as 'DONE' | 'NOT_DONE' | 'SKIPPED',
            rejectionReasonId: p.rejectionReasonId as string | undefined,
            observation: p.observation as string | undefined,
            clientOperationId: op.clientOperationId,
          },
          user,
        );
        return {
          clientOperationId: op.clientOperationId,
          status: 'SUCCESS',
          serverEntityId: record.id,
          entityType: 'TASK_EXECUTION',
          version: null,
          error: null,
        };
      }

      case SyncOperationType.MARK_PERIODIC_TASK: {
        const periodicTaskInstanceId = (op.entityId ?? p.periodicTaskInstanceId) as
          | string
          | undefined;
        const status = p.status as string | undefined;
        if (!periodicTaskInstanceId || !status) {
          throw new BadRequestException(
            'MARK_PERIODIC_TASK payload requires: periodicTaskInstanceId, status',
          );
        }
        const record = await this.tasksService.markPeriodicInstance(
          periodicTaskInstanceId,
          {
            status: status as 'DONE' | 'NOT_DONE' | 'SKIPPED',
            rejectionReasonId: p.rejectionReasonId as string | undefined,
            observation: p.observation as string | undefined,
            clientOperationId: op.clientOperationId,
          },
          user,
        );
        return {
          clientOperationId: op.clientOperationId,
          status: 'SUCCESS',
          serverEntityId: record.id,
          entityType: 'TASK_EXECUTION',
          version: null,
          error: null,
        };
      }

      case SyncOperationType.COMPLETE_WORK_ORDER: {
        const workOrderId = (op.entityId ?? p.workOrderId) as string | undefined;
        if (!workOrderId) {
          throw new BadRequestException(
            'COMPLETE_WORK_ORDER requires entityId (workOrderId)',
          );
        }
        const wo = await this.workOrdersService.complete(workOrderId, user);
        return {
          clientOperationId: op.clientOperationId,
          status: 'SUCCESS',
          serverEntityId: wo.id,
          entityType: 'WORK_ORDER',
          version: (wo as { version?: number }).version ?? null,
          error: null,
        };
      }

      default: {
        throw new BadRequestException(
          `Unknown operationType: ${String(op.operationType)}`,
        );
      }
    }
  }

  // ─── PRIVATE: persist SyncOperation record ───────────────────────────────

  private async saveSyncOp(
    op: SyncOperationItemDto,
    deviceId: string,
    userId: string,
    result: SyncOperationResult,
  ) {
    try {
      await this.prisma.syncOperation.create({
        data: {
          userId,
          deviceId,
          clientOperationId: op.clientOperationId,
          operationType: op.operationType,
          entityType: op.entityType,
          entityId: result.serverEntityId ?? null,
          payload: op.payload as object,
          result: result as object,
          status: result.status,
          errorCode: result.error?.code ?? null,
          errorMessage: result.error?.message ?? null,
          occurredAt: new Date(op.occurredAt),
          processedAt: new Date(),
        },
      });
    } catch {
      // Unique constraint violation means a concurrent request already saved it.
      // Safe to swallow — the caller already returned ALREADY_PROCESSED.
    }
  }

  // ─── PRIVATE: translate exceptions to sync error ─────────────────────────

  private buildErrorResult(
    op: SyncOperationItemDto,
    error: unknown,
  ): SyncOperationResult {
    const syncError = this.toSyncError(error);
    return {
      clientOperationId: op.clientOperationId,
      status: 'FAILED',
      serverEntityId: null,
      entityType: op.entityType,
      version: null,
      error: syncError,
    };
  }

  private toSyncError(error: unknown): SyncError {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? String((response as Record<string, unknown>)['message'])
          : String(response);

      return { code: this.httpExceptionToCode(error, message), message };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected error',
    };
  }

  private httpExceptionToCode(error: HttpException, message: string): string {
    const status = error.getStatus();
    if (status === 403) {
      if (message.includes('radius') || message.includes('away from')) return 'OUTSIDE_BUILDING_RADIUS';
      if (message.includes('attendance')) return 'ACTIVE_ATTENDANCE_REQUIRED';
      if (message.includes('ACCEPTED assignment')) return 'ASSIGNMENT_REQUIRED';
      return 'FORBIDDEN';
    }
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) {
      if (message.includes('already have an active check-in')) return 'ALREADY_CHECKED_IN';
      if (message.includes('already marked')) return 'TASK_ALREADY_MARKED';
      if (message.includes('already a participant')) return 'ALREADY_PARTICIPANT';
      if (
        message.includes('task(s) not executed') ||
        message.includes('tarea(s) sin ejecutar')
      ) {
        return 'CHECKLIST_INCOMPLETE';
      }
      if (
        message.includes('requires at least one photo') ||
        message.includes('requiere al menos una foto')
      ) {
        return 'PHOTO_REQUIRED';
      }
      return 'CONFLICT';
    }
    if (status === 400) {
      if (message.includes('GPS') || message.includes('coordinates')) return 'BUILDING_GPS_NOT_CONFIGURED';
      return 'BAD_REQUEST';
    }
    if (status === 422) return 'VALIDATION_ERROR';
    return 'HTTP_ERROR';
  }
}
