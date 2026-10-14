import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, QuoteStatus, WorkOrderType } from '@prisma/client';
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
import { isBranchAccessible, loadBranchAccessScope } from '../../common/branch-access';

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
      includePendingQuotes = false,
      limit = 2000,
    } = query;

    const buildingIds = query.buildingIds ?? [];
    const branchId = query.branchId;
    let allowedBuildingIds = buildingIds;

    if (user && buildingIds.length) {
      const scope = await loadBuildingAccessScope(this.prisma, user.id);
      allowedBuildingIds = filterRequestedBuildingIds(scope, buildingIds);
    }

    if (user && branchId) {
      const branchScope = await loadBranchAccessScope(this.prisma, user.id);
      if (!isBranchAccessible(branchScope, branchId)) {
        allowedBuildingIds = [];
      }
    }

    if (!allowedBuildingIds.length) {
      return {
        reservations: [],
        services: [],
        quotes: [],
        from,
        to,
        totals: { reservations: 0, services: 0, quotes: 0 },
        truncated: { reservations: false, services: false, quotes: false },
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

    const [reservationResult, serviceResult, quoteResult] = await Promise.all([
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
      includePendingQuotes
        ? this.fetchPendingQuotes({
            fromDate,
            toDate,
            buildingFilter,
            limit,
          })
        : { items: [], total: 0, truncated: false },
    ]);

    return {
      reservations: reservationResult.items,
      services: serviceResult.items,
      quotes: quoteResult.items,
      from,
      to,
      totals: {
        reservations: reservationResult.total,
        services: serviceResult.total,
        quotes: quoteResult.total,
      },
      truncated: {
        reservations: reservationResult.truncated,
        services: serviceResult.truncated,
        quotes: quoteResult.truncated,
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

  /** Cotizados y en espera, sin servicio asociado. La fecha del calendario es la de solicitud. */
  private async fetchPendingQuotes(params: {
    fromDate: Date;
    toDate: Date;
    buildingFilter: string | { in: string[] };
    limit: number;
  }) {
    const where: Prisma.QuoteWhereInput = {
      deletedAt: null,
      status: { in: [QuoteStatus.COTIZADO, QuoteStatus.EN_ESPERA] },
      requestDate: { gte: params.fromDate, lte: params.toDate },
      OR: [
        { buildingId: params.buildingFilter },
        {
          particularClient: {
            buildingId: params.buildingFilter,
            deletedAt: null,
          },
        },
        {
          buildingId: null,
          particularClientId: null,
          eventualClientId: { not: null },
        },
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        take: params.limit,
        orderBy: [{ requestDate: 'asc' }, { number: 'asc' }],
        select: {
          id: true,
          number: true,
          status: true,
          requestDate: true,
          serviceType: true,
          total: true,
          buildingId: true,
          building: { select: { id: true, name: true } },
          particularClient: {
            select: {
              name: true,
              buildingId: true,
              building: { select: { id: true, name: true } },
            },
          },
          eventualClient: { select: { name: true } },
        },
      }),
      this.prisma.quote.count({ where }),
    ]);

    return {
      items: rows.map((quote) => {
        const site = quote.building ?? quote.particularClient?.building ?? null;
        const clientName =
          quote.particularClient?.name?.trim() ||
          quote.eventualClient?.name?.trim() ||
          quote.building?.name?.trim() ||
          'Cliente';
        return {
          id: quote.id,
          number: quote.number,
          status: quote.status,
          requestDate: quote.requestDate,
          serviceType: quote.serviceType,
          total: Number(quote.total),
          buildingId: quote.buildingId ?? quote.particularClient?.buildingId ?? null,
          clientName,
          building: site,
          particularClient: quote.particularClient
            ? { name: quote.particularClient.name }
            : null,
          eventualClient: quote.eventualClient
            ? { name: quote.eventualClient.name }
            : null,
        };
      }),
      total,
      truncated: total > params.limit,
    };
  }
}
