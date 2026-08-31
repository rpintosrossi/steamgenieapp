import { BadRequestException, Injectable } from '@nestjs/common';
import { WorkOrderType } from '@prisma/client';
import {
  businessDayInstantRange,
  endOfStoredCalendarDateInBusinessTz,
  parseCalendarDateInput,
} from '@steam-genie/shared-constants';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { QueryEventualCalendarDto } from './dto/query-eventual-calendar.dto';
import { workOrderBranchWhere } from '../work-orders/work-order-branch.filter';
import type { AuthUser } from '@steam-genie/shared-types';
import {
  filterRequestedBuildingIds,
  loadBuildingAccessScope,
} from '../../common/building-access';

const LOCATION_SELECT = {
  building: { select: { id: true, name: true } },
  floor: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true } },
  subzone: { select: { id: true, name: true } },
} as const;

const ACTIVE_ASSIGNMENT_STATUSES = ['PENDING', 'ACCEPTED'] as const;

@Injectable()
export class EventualCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(query: QueryEventualCalendarDto, user?: AuthUser) {
    const {
      from,
      to,
      floorId,
      zoneId,
      workerId,
      includeReservations = true,
      includeServices = true,
      limit = 2000,
    } = query;

    const buildingIds = query.buildingIds ?? [];
    const branchId = query.branchId;
    let allowedBuildingIds = buildingIds;

    if (user && buildingIds.length) {
      const scope = await loadBuildingAccessScope(this.prisma, user.id);
      allowedBuildingIds = filterRequestedBuildingIds(scope, buildingIds);
    }

    if (!allowedBuildingIds.length) {
      return {
        reservations: [],
        services: [],
        from,
        to,
        totals: { reservations: 0, services: 0 },
        truncated: { reservations: false, services: false },
      };
    }

    const buildingFilter =
      allowedBuildingIds.length === 1 ? allowedBuildingIds[0]! : { in: allowedBuildingIds };

    const fromDate = parseCalendarDateInput(from);
    const toDate = parseCalendarDateInput(to);
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const rangeStart = businessDayInstantRange(from).start;
    const rangeEnd = endOfStoredCalendarDateInBusinessTz(to);

    const [reservationResult, serviceResult] = await Promise.all([
      includeReservations
        ? this.fetchReservations({
            rangeStart,
            rangeEnd,
            buildingFilter,
            floorId,
            zoneId,
            limit,
          })
        : { items: [], total: 0, truncated: false },
      includeServices
        ? this.fetchServices({
            fromDate,
            toDate,
            buildingFilter,
            floorId,
            zoneId,
            workerId,
            branchId,
            limit,
          })
        : { items: [], total: 0, truncated: false },
    ]);

    return {
      reservations: reservationResult.items,
      services: serviceResult.items,
      from,
      to,
      totals: {
        reservations: reservationResult.total,
        services: serviceResult.total,
      },
      truncated: {
        reservations: reservationResult.truncated,
        services: serviceResult.truncated,
      },
    };
  }

  private async fetchReservations(params: {
    rangeStart: Date;
    rangeEnd: Date;
    buildingFilter: string | { in: string[] };
    floorId?: string;
    zoneId?: string;
    limit: number;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      buildingId: params.buildingFilter,
      AND: [
        { checkinAt: { lt: params.rangeEnd } },
        { checkoutAt: { gt: params.rangeStart } },
      ],
    };
    if (params.floorId) where.floorId = params.floorId;
    if (params.zoneId) where.zoneId = params.zoneId;

    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        take: params.limit,
        orderBy: { checkinAt: 'asc' },
        select: {
          id: true,
          buildingId: true,
          floorId: true,
          zoneId: true,
          subzoneId: true,
          externalId: true,
          guestName: true,
          checkinAt: true,
          checkoutAt: true,
          ...LOCATION_SELECT,
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        ...r,
        durationMs: new Date(r.checkoutAt).getTime() - new Date(r.checkinAt).getTime(),
      })),
      total,
      truncated: total > params.limit,
    };
  }

  private async fetchServices(params: {
    fromDate: Date;
    toDate: Date;
    buildingFilter: string | { in: string[] };
    floorId?: string;
    zoneId?: string;
    workerId?: string;
    branchId?: string;
    limit: number;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      deletedAt: null,
      type: WorkOrderType.CHECKOUT_CLEANING,
      buildingId: params.buildingFilter,
      scheduledDate: { gte: params.fromDate, lte: params.toDate },
    };
    if (params.floorId) where.floorId = params.floorId;
    if (params.zoneId) where.zoneId = params.zoneId;
    if (params.workerId) {
      where.assignments = {
        some: {
          userId: params.workerId,
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
        },
      };
    }
    if (params.branchId) {
      Object.assign(where, workOrderBranchWhere(params.branchId));
    }

    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        take: params.limit,
        orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
        select: {
          id: true,
          title: true,
          status: true,
          buildingId: true,
          floorId: true,
          zoneId: true,
          subzoneId: true,
          reservationId: true,
          scheduledDate: true,
          scheduledTime: true,
          deadlineAt: true,
          ...LOCATION_SELECT,
          assignments: {
            where: { status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
            select: {
              id: true,
              userId: true,
              status: true,
              user: { select: { id: true, fullName: true, dni: true } },
            },
          },
        },
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      items: rows.map((wo) => {
        const activeAssignments = wo.assignments;
        const unassigned =
          wo.status === 'UNASSIGNED' || activeAssignments.length === 0;
        return {
          ...wo,
          activeAssignments,
          unassigned,
        };
      }),
      total,
      truncated: total > params.limit,
    };
  }
}
