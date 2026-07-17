import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { QueryAttendanceTimelineDto } from './dto/query-attendance-timeline.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import type { AuthUser } from '@steam-genie/shared-types';
import { businessDayInstantRange } from '@steam-genie/shared-constants';
import { PeriodicTaskInstanceStatus } from '@prisma/client';

const TIMELINE_SELECT = {
  id: true,
  checkInAt: true,
  checkOutAt: true,
  user: { select: { id: true, fullName: true, dni: true } },
  building: { select: { id: true, name: true } },
} as const;

const TIMELINE_MAX_ROWS = 2000;

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CHECK-IN ─────────────────────────────────────────────────────────────

  async checkIn(user: AuthUser, dto: CheckInDto, ip?: string) {
    const now = new Date();

    // GPS validation — must be inside building radius
    await this.assertInsideBuilding(dto.buildingId, dto.gpsLat, dto.gpsLng);

    // Idempotency for offline sync
    if (dto.clientOperationId) {
      const existing = await this.prisma.attendance.findUnique({
        where: { clientOperationId: dto.clientOperationId },
        select: { id: true },
      });
      if (existing) return this.findById(existing.id);
    }

    // Check for any open attendance for this user (across all buildings)
    const openAttendance = await this.prisma.attendance.findFirst({
      where: { userId: user.id, checkOutAt: null, deletedAt: null },
    });

    if (openAttendance) {
      if (openAttendance.buildingId === dto.buildingId) {
        // Idempotente: reintento o UI desincronizada — devolver el fichaje activo.
        return this.findById(openAttendance.id);
      }
      // Open attendance in a different building — auto-close as forgotten checkout
      await this.prisma.attendance.update({
        where: { id: openAttendance.id },
        data: { checkOutAt: now, forgotCheckout: true },
      });
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        userId: user.id,
        buildingId: dto.buildingId,
        checkInAt: now,
        checkInOccurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
        checkInGpsLat: dto.gpsLat,
        checkInGpsLng: dto.gpsLng,
        checkInDeviceId: dto.deviceId ?? null,
        checkInIp: ip ?? null,
        clientOperationId: dto.clientOperationId ?? null,
      },
    });

    return this.findById(attendance.id);
  }

  // ─── CHECK-OUT ────────────────────────────────────────────────────────────

  async checkOut(user: AuthUser, dto: CheckOutDto, ip?: string) {
    const now = new Date();

    const attendance = await this.prisma.attendance.findFirst({
      where: { userId: user.id, checkOutAt: null, deletedAt: null },
    });
    if (!attendance) {
      // Idempotente: reintento o UI desincronizada — ya fichó salida.
      const lastClosed = await this.prisma.attendance.findFirst({
        where: { userId: user.id, deletedAt: null, checkOutAt: { not: null } },
        orderBy: { checkOutAt: 'desc' },
      });
      if (lastClosed) {
        return { ok: true as const, attendanceId: lastClosed.id };
      }
      throw new NotFoundException('No active check-in found for this user');
    }

    // GPS validation — must be inside the building where the open check-in was recorded
    await this.assertInsideBuilding(attendance.buildingId, dto.gpsLat, dto.gpsLng);

    await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOutAt: now,
        checkOutOccurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
        checkOutGpsLat: dto.gpsLat,
        checkOutGpsLng: dto.gpsLng,
        checkOutDeviceId: dto.deviceId ?? null,
        checkOutIp: ip ?? null,
      },
    });

    return { ok: true as const, attendanceId: attendance.id };
  }

  // ─── FIND ACTIVE ──────────────────────────────────────────────────────────

  async findActive(userId: string) {
    return this.prisma.attendance.findFirst({
      where: { userId, checkOutAt: null, deletedAt: null },
      include: {
        building: { select: { id: true, name: true } },
      },
    });
  }

  async findLast(userId: string) {
    return this.prisma.attendance.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { checkInAt: 'desc' },
      select: {
        id: true,
        checkInAt: true,
        checkOutAt: true,
        building: { select: { id: true, name: true } },
      },
    });
  }

  async findTodaySummary(userId: string) {
    const { start, end } = businessDayInstantRange();

    const buildingSelect = {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      gpsRadiusM: true,
      requireGpsValidation: true,
    } as const;

    const todayEntries = await this.prisma.attendance.findMany({
      where: {
        userId,
        deletedAt: null,
        checkInAt: { gte: start, lt: end },
      },
      orderBy: { checkInAt: 'desc' },
      select: {
        buildingId: true,
        checkInAt: true,
        checkOutAt: true,
        building: { select: buildingSelect },
      },
    });

    const activeEntry = todayEntries.find((entry) => entry.checkOutAt === null) ?? null;

    return {
      active: activeEntry
        ? {
            buildingId: activeEntry.buildingId,
            checkInAt: activeEntry.checkInAt,
            building: activeEntry.building,
          }
        : null,
      todayEntries,
    };
  }

  // ─── FIND ALL (admin/manager) ─────────────────────────────────────────────

  async findAll(query: QueryAttendanceDto) {
    const { page = 1, limit = 20, userId, buildingId, date } = query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { deletedAt: null };

    if (userId) where.userId = userId;
    if (buildingId) where.buildingId = buildingId;
    if (date) {
      const { start, end } = businessDayInstantRange(date);
      where.checkInAt = { gte: start, lt: end };
    }

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { checkInAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, dni: true } },
          building: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── TIMELINE (admin/manager) ─────────────────────────────────────────────

  async findTimeline(query: QueryAttendanceTimelineDto) {
    const { start, end } = businessDayInstantRange(query.date);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      deletedAt: null,
      checkInAt: { gte: start, lt: end },
    };
    if (query.userId) where.userId = query.userId;
    if (query.buildingId) where.buildingId = query.buildingId;

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        orderBy: { checkInAt: 'asc' },
        take: TIMELINE_MAX_ROWS,
        select: TIMELINE_SELECT,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    // Enrich each attendance item with task progress for its building on this date
    const buildingIds = [...new Set(data.map((d) => d.building.id))];
    const taskProgressMap = await this.buildTaskProgressMap(buildingIds, query.date);

    const enrichedData = data.map((item) => ({
      ...item,
      taskProgress: taskProgressMap.get(item.building.id) ?? { total: 0, completed: 0 },
    }));

    return {
      data: enrichedData,
      total,
      truncated: total > TIMELINE_MAX_ROWS,
    };
  }

  private async buildTaskProgressMap(
    buildingIds: string[],
    dateStr: string | undefined,
  ): Promise<Map<string, { total: number; completed: number }>> {
    if (buildingIds.length === 0) return new Map();

    // Resolve the calendar key (YYYY-MM-DD) using the same logic as businessDayInstantRange
    const { calendarDateKeyInBusinessTz } = await import('@steam-genie/shared-constants');
    const key = dateStr ?? calendarDateKeyInBusinessTz(new Date());
    // @db.Date fields are stored as midnight UTC
    const refDate = new Date(`${key}T00:00:00.000Z`);

    const instances = await this.prisma.periodicTaskInstance.findMany({
      where: {
        periodStart: { lte: refDate },
        periodEnd: { gte: refDate },
        task: {
          buildingId: { in: buildingIds },
        },
      },
      select: {
        status: true,
        task: { select: { buildingId: true } },
        taskExecutions: {
          orderBy: { executedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    });

    const map = new Map<string, { total: number; completed: number }>();
    for (const instance of instances) {
      const bid = instance.task.buildingId;
      const entry = map.get(bid) ?? { total: 0, completed: 0 };
      entry.total++;
      // Only count executions marked as DONE. A task marked NOT_DONE or SKIPPED
      // still sets the instance to COMPLETED, but is not "realizada" for the user.
      const lastExec = instance.taskExecutions[0];
      if (
        instance.status === PeriodicTaskInstanceStatus.COMPLETED &&
        lastExec?.status === 'DONE'
      ) {
        entry.completed++;
      }
      map.set(bid, entry);
    }
    return map;
  }

  // ─── TIMELINE TASK DETAIL (admin/manager) ─────────────────────────────────
  // Returns the same task set counted by buildTaskProgressMap, but with details
  // for the timeline expand-row UI. Mirrors that query exactly to avoid mismatch.
  async findTimelineTasks(buildingId: string, dateStr?: string) {
    const { calendarDateKeyInBusinessTz } = await import('@steam-genie/shared-constants');
    const key = dateStr ?? calendarDateKeyInBusinessTz(new Date());
    const refDate = new Date(`${key}T00:00:00.000Z`);

    const instances = await this.prisma.periodicTaskInstance.findMany({
      where: {
        periodStart: { lte: refDate },
        periodEnd: { gte: refDate },
        task: { buildingId },
      },
      orderBy: [{ status: 'asc' }, { periodStart: 'asc' }],
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        completedAt: true,
        task: {
          select: {
            id: true,
            name: true,
            frequency: true,
            isActive: true,
            zone: {
              select: {
                id: true,
                name: true,
                floor: { select: { id: true, name: true } },
              },
            },
            subzone: { select: { id: true, name: true } },
          },
        },
        taskExecutions: {
          orderBy: { executedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            executedAt: true,
            observation: true,
            rejectionReason: { select: { id: true, text: true } },
            executedBy: { select: { id: true, fullName: true, dni: true } },
          },
        },
      },
    });

    return instances.map((instance) => {
      const execution = instance.taskExecutions[0] ?? null;
      const execStatus = execution?.status; // 'DONE' | 'NOT_DONE' | 'SKIPPED' | undefined
      const isPeriodicallyCompleted = instance.status === PeriodicTaskInstanceStatus.COMPLETED;

      // Derive display status from the *execution* status when present, so that
      // a task marked NOT_DONE / SKIPPED shows correctly (not "Realizada").
      let displayStatus: 'COMPLETED' | 'NOT_DONE' | 'SKIPPED' | 'OVERDUE' | 'SCHEDULED';
      if (isPeriodicallyCompleted && execStatus === 'DONE') displayStatus = 'COMPLETED';
      else if (isPeriodicallyCompleted && execStatus === 'NOT_DONE') displayStatus = 'NOT_DONE';
      else if (isPeriodicallyCompleted && execStatus === 'SKIPPED') displayStatus = 'SKIPPED';
      else if (instance.periodEnd < refDate) displayStatus = 'OVERDUE';
      else displayStatus = 'SCHEDULED';

      return {
        id: instance.id,
        taskId: instance.task.id,
        name: instance.task.name,
        frequency: instance.task.frequency,
        isActive: instance.task.isActive,
        zone: instance.task.zone,
        subzone: instance.task.subzone,
        instanceStatus: instance.status,
        displayStatus,
        completedAt: instance.completedAt?.toISOString() ?? null,
        execution: execution
          ? {
              id: execution.id,
              status: execution.status,
              executedAt: execution.executedAt.toISOString(),
              executedBy: execution.executedBy,
              observation: execution.observation,
              rejectionReason: execution.rejectionReason
                ? { id: execution.rejectionReason.id, reason: execution.rejectionReason.text }
                : null,
            }
          : null,
      };
    });
  }

  // ─── CORRECT (admin/manager) ──────────────────────────────────────────────

  async correct(id: string, dto: CorrectAttendanceDto, adminUser: AuthUser) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attendance) throw new NotFoundException('Attendance record not found');

    const hasRole = await this.prisma.userBuildingRole.findFirst({
      where: {
        userId: adminUser.id,
        role: { name: { in: ['admin', 'manager'] } },
        OR: [{ buildingId: null }, { buildingId: attendance.buildingId }],
      },
    });
    if (!hasRole) {
      throw new ForbiddenException(
        'You do not have permission to correct attendance records for this building',
      );
    }

    await this.prisma.attendance.update({
      where: { id },
      data: {
        ...(dto.checkInAt ? { checkInAt: new Date(dto.checkInAt) } : {}),
        ...(dto.checkOutAt ? { checkOutAt: new Date(dto.checkOutAt) } : {}),
        correctedById: adminUser.id,
        correctionNote: dto.correctionNote,
        version: { increment: 1 },
      },
    });

    return this.findById(id);
  }

  // ─── PRIVATE: GPS validation ──────────────────────────────────────────────

  /**
   * Loads the building's GPS center and radius, then validates that the given
   * coordinates are within the configured radius.
   * Throws if:
   *   - Building not found / inactive.
   *   - Building has no GPS coordinates configured.
   *   - User is outside the allowed radius.
   */
  private async assertInsideBuilding(
    buildingId: string,
    gpsLat: number,
    gpsLng: number,
  ) {
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        gpsRadiusM: true,
        requireGpsValidation: true,
      },
    });

    if (!building) throw new NotFoundException('Edificio no encontrado');

    if (!building.requireGpsValidation) {
      return;
    }

    if (building.latitude == null || building.longitude == null) {
      throw new BadRequestException(
        'Este edificio no tiene coordenadas GPS configuradas. Contactá a un administrador.',
      );
    }

    const distanceM = this.haversineDistanceM(
      Number(building.latitude),
      Number(building.longitude),
      gpsLat,
      gpsLng,
    );

    if (distanceM > building.gpsRadiusM) {
      throw new ForbiddenException(
        `Estás a ${Math.round(distanceM)} m de "${building.name}". ` +
          `El radio permitido es de ${building.gpsRadiusM} m. Acercate al edificio e intentá de nuevo.`,
      );
    }
  }

  /** Haversine great-circle distance between two WGS-84 coordinates, in metres. */
  private haversineDistanceM(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6_371_000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lng2 - lng1);
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── PRIVATE: DB helpers ──────────────────────────────────────────────────

  private findById(id: string) {
    return this.prisma.attendance.findUniqueOrThrow({
      where: { id },
      include: {
        building: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true, dni: true } },
      },
    });
  }
}
