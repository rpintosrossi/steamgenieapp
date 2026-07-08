import { Injectable } from '@nestjs/common';
import {
  PeriodicTaskInstanceStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@prisma/client';
import {
  businessDayInstantRange,
  calendarDateKeyInBusinessTz,
  deriveReservationStatus,
  RESERVATION_STATUS,
  showsZoneReadiness,
} from '@steam-genie/shared-constants';
import type { AuthUser } from '@steam-genie/shared-types';
import { enrichReservationsWithReadiness } from '../../common/reservation-zone-readiness';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { attendanceDurationMs } from '../reports/helpers/report-fields.helper';
import {
  buildingIdFilter,
  resolveAccessibleBuildingIds,
} from '../reports/helpers/report-query.helpers';
import { QueryDashboardStatsDto } from './dto/query-dashboard-stats.dto';

const EXTERNAL_VIEWER_ROLES = new Set(['client', 'provider']);

export interface DashboardOperationalTimes {
  /** Promedio de duración de servicios completados hoy (minutos). */
  avgServiceDurationMinutes: number | null;
  /** Horas totales fichadas hoy en edificios del alcance. */
  totalAttendanceHoursToday: number;
}

export interface DashboardStats {
  pendingServices: number;
  inProgressServices: number;
  completedServicesToday: number;
  upcomingReservations: number;
  roomsNotReady: number;
  overdueTasks: number;
  activePresence: number;
  operationalTimes: DashboardOperationalTimes;
  generatedAt: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(query: QueryDashboardStatsDto, user: AuthUser): Promise<DashboardStats> {
    const now = new Date();
    const { start: todayStart, end: todayEnd } = businessDayInstantRange();
    const todayDate = new Date(`${calendarDateKeyInBusinessTz(now)}T00:00:00.000Z`);

    let buildingIds: string[] = [];
    try {
      buildingIds = await resolveAccessibleBuildingIds(
        this.prisma,
        user.id,
        query.buildingId,
      );
    } catch {
      return this.emptyStats(now);
    }

    if (buildingIds.length === 0) {
      return this.emptyStats(now);
    }

    const buildingFilter = buildingIdFilter(buildingIds);
    const isExternalViewer = EXTERNAL_VIEWER_ROLES.has(user.primaryRole);

    const workOrderBase = {
      deletedAt: null,
      buildingId: buildingFilter,
      ...(isExternalViewer
        ? {
            type: WorkOrderType.CHECKOUT_CLEANING,
          }
        : {}),
    };

    const pendingStatuses = isExternalViewer
      ? [WorkOrderStatus.ACCEPTED]
      : [WorkOrderStatus.UNASSIGNED, WorkOrderStatus.ASSIGNED, WorkOrderStatus.ACCEPTED];

    const [
      pendingServices,
      inProgressServices,
      completedServicesToday,
      reservationRows,
      overdueTasks,
      activePresence,
      completedExecutionsToday,
      attendancesToday,
    ] = await Promise.all([
      this.prisma.workOrder.count({
        where: {
          ...workOrderBase,
          status: { in: pendingStatuses },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...workOrderBase,
          status: WorkOrderStatus.IN_PROGRESS,
        },
      }),
      this.prisma.workOrder.count({
        where: {
          ...workOrderBase,
          status: WorkOrderStatus.COMPLETED,
          completedAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          buildingId: buildingFilter,
          checkoutAt: { gte: todayStart },
        },
        select: {
          id: true,
          zoneId: true,
          checkinAt: true,
          checkoutAt: true,
        },
      }),
      this.countOverdueTasks(buildingFilter, todayDate),
      this.prisma.attendance.count({
        where: {
          deletedAt: null,
          checkOutAt: null,
          buildingId: buildingFilter,
        },
      }),
      this.prisma.serviceExecution.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: todayStart, lt: todayEnd },
          workOrder: {
            deletedAt: null,
            buildingId: buildingFilter,
            ...(isExternalViewer ? { type: WorkOrderType.CHECKOUT_CLEANING } : {}),
          },
        },
        select: {
          startedAt: true,
          completedAt: true,
        },
      }),
      this.prisma.attendance.findMany({
        where: {
          deletedAt: null,
          checkInAt: { gte: todayStart, lt: todayEnd },
          buildingId: buildingFilter,
        },
        select: {
          checkInAt: true,
          checkOutAt: true,
        },
      }),
    ]);

    const { upcomingReservations, roomsNotReady } =
      await this.countReservationIndicators(reservationRows, now);

    const operationalTimes = this.computeOperationalTimes(
      completedExecutionsToday,
      attendancesToday,
      now,
    );

    return {
      pendingServices,
      inProgressServices,
      completedServicesToday,
      upcomingReservations,
      roomsNotReady,
      overdueTasks,
      activePresence,
      operationalTimes,
      generatedAt: now.toISOString(),
    };
  }

  private emptyStats(now: Date): DashboardStats {
    return {
      pendingServices: 0,
      inProgressServices: 0,
      completedServicesToday: 0,
      upcomingReservations: 0,
      roomsNotReady: 0,
      overdueTasks: 0,
      activePresence: 0,
      operationalTimes: {
        avgServiceDurationMinutes: null,
        totalAttendanceHoursToday: 0,
      },
      generatedAt: now.toISOString(),
    };
  }

  private async countOverdueTasks(
    buildingFilter: string | { in: string[] },
    todayDate: Date,
  ): Promise<number> {
    return this.prisma.periodicTaskInstance.count({
      where: {
        task: {
          deletedAt: null,
          isActive: true,
          buildingId: buildingFilter,
        },
        OR: [
          { status: PeriodicTaskInstanceStatus.EXPIRED },
          {
            status: PeriodicTaskInstanceStatus.PENDING,
            periodEnd: { lt: todayDate },
          },
        ],
      },
    });
  }

  private async countReservationIndicators(
    reservations: Array<{
      id: string;
      zoneId: string;
      checkinAt: Date;
      checkoutAt: Date;
    }>,
    now: Date,
  ): Promise<{ upcomingReservations: number; roomsNotReady: number }> {
    let upcomingReservations = 0;

    for (const reservation of reservations) {
      const status = deriveReservationStatus(
        reservation.checkinAt,
        reservation.checkoutAt,
        now,
      );
      if (status === RESERVATION_STATUS.UPCOMING) {
        upcomingReservations += 1;
      }
    }

    const readinessCandidates = reservations.filter((reservation) => {
      const status = deriveReservationStatus(
        reservation.checkinAt,
        reservation.checkoutAt,
        now,
      );
      return showsZoneReadiness(status);
    });

    if (readinessCandidates.length === 0) {
      return { upcomingReservations, roomsNotReady: 0 };
    }

    const enriched = await enrichReservationsWithReadiness(
      this.prisma,
      readinessCandidates,
      now,
    );

    const roomsNotReady = enriched.filter((item) => item.zoneReadiness?.notReady).length;

    return { upcomingReservations, roomsNotReady };
  }

  private computeOperationalTimes(
    completedExecutions: Array<{ startedAt: Date; completedAt: Date | null }>,
    attendancesToday: Array<{ checkInAt: Date; checkOutAt: Date | null }>,
    now: Date,
  ): DashboardOperationalTimes {
    let totalServiceMs = 0;
    let serviceCount = 0;

    for (const execution of completedExecutions) {
      if (!execution.completedAt) continue;
      totalServiceMs += Math.max(
        0,
        execution.completedAt.getTime() - execution.startedAt.getTime(),
      );
      serviceCount += 1;
    }

    let totalAttendanceMs = 0;
    for (const attendance of attendancesToday) {
      totalAttendanceMs += attendanceDurationMs(
        attendance.checkInAt,
        attendance.checkOutAt,
        now,
      );
    }

    return {
      avgServiceDurationMinutes:
        serviceCount > 0
          ? Math.round(totalServiceMs / serviceCount / 60_000)
          : null,
      totalAttendanceHoursToday:
        Math.round((totalAttendanceMs / 3_600_000) * 10) / 10,
    };
  }
}
