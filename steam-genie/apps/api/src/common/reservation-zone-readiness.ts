import { WorkOrderStatus, WorkOrderType } from '@prisma/client';
import {
  buildZoneReadinessIndex,
  businessDayInstantRange,
  calendarDateKeyInBusinessTz,
  computeZoneReadinessFromIndex,
  deriveReservationStatus,
  endOfBusinessCalendarDay,
  findPreviousZoneReservation,
  showsZoneReadiness,
  type ReservationReadinessInput,
  type ZoneCleaningSnapshot,
  type ZoneReadinessFlags,
  type ZoneReservationSnapshot,
} from '@steam-genie/shared-constants';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

/** Reservas previas recientes por zona (suficiente para encadenamiento típico). */
const RESERVATION_HISTORY_LIMIT = 100;
/** Limpiezas recientes cuando no hay checkout previo acotado. */
const CLEANING_HISTORY_LIMIT = 100;

interface ReservationRow {
  id: string;
  zoneId: string;
  checkinAt: Date;
  checkoutAt: Date;
}

interface ZoneBounds {
  zoneId: string;
  maxCheckinAt: Date;
}

export interface ReservationReadinessFields {
  status: ReturnType<typeof deriveReservationStatus>;
  zoneReadiness: ZoneReadinessFlags | null;
}

export async function enrichReservationsWithReadiness<T extends ReservationRow>(
  prisma: PrismaService,
  reservations: T[],
  now: Date = new Date(),
): Promise<Array<T & ReservationReadinessFields>> {
  if (reservations.length === 0) return [];

  const statusById = new Map<string, ReturnType<typeof deriveReservationStatus>>();
  for (const reservation of reservations) {
    statusById.set(
      reservation.id,
      deriveReservationStatus(reservation.checkinAt, reservation.checkoutAt, now),
    );
  }

  const eligibleItems = reservations.filter((reservation) =>
    showsZoneReadiness(statusById.get(reservation.id)!),
  );

  if (eligibleItems.length === 0) {
    return reservations.map((reservation) => ({
      ...reservation,
      status: statusById.get(reservation.id)!,
      zoneReadiness: null,
    }));
  }

  const zoneBounds = buildZoneBounds(eligibleItems);
  const { zoneReservations, zoneCleanings } = await loadZoneReadinessData(
    prisma,
    zoneBounds,
    eligibleItems,
    now,
  );

  const index = buildZoneReadinessIndex(zoneReservations, zoneCleanings, now);

  return reservations.map((reservation) => {
    const status = statusById.get(reservation.id)!;
    const zoneReadiness = showsZoneReadiness(status)
      ? computeZoneReadinessFromIndex(reservation, index, status)
      : null;

    return { ...reservation, status, zoneReadiness };
  });
}

function buildZoneBounds(items: ReservationReadinessInput[]): ZoneBounds[] {
  const maxCheckinByZone = new Map<string, Date>();
  for (const item of items) {
    const current = maxCheckinByZone.get(item.zoneId);
    if (!current || item.checkinAt > current) {
      maxCheckinByZone.set(item.zoneId, item.checkinAt);
    }
  }
  return [...maxCheckinByZone.entries()].map(([zoneId, maxCheckinAt]) => ({
    zoneId,
    maxCheckinAt,
  }));
}

async function loadZoneReadinessData(
  prisma: PrismaService,
  zoneBounds: ZoneBounds[],
  eligibleItems: ReservationReadinessInput[],
  now: Date,
): Promise<{
  zoneReservations: ZoneReservationSnapshot[];
  zoneCleanings: ZoneCleaningSnapshot[];
}> {
  const { start: todayStart, end: todayEndExclusive } = businessDayInstantRange(
    calendarDateKeyInBusinessTz(now),
  );
  const todayEnd = endOfBusinessCalendarDay(now);
  const reservationById = new Map<string, ZoneReservationSnapshot>();

  for (const item of eligibleItems) {
    reservationById.set(item.id, item);
  }

  await Promise.all(
    zoneBounds.map(async ({ zoneId, maxCheckinAt }) => {
      const [history, overlappingToday] = await Promise.all([
        prisma.reservation.findMany({
          where: { zoneId, checkoutAt: { lt: maxCheckinAt } },
          orderBy: { checkoutAt: 'desc' },
          take: RESERVATION_HISTORY_LIMIT,
          select: {
            id: true,
            zoneId: true,
            checkinAt: true,
            checkoutAt: true,
          },
        }),
        prisma.reservation.findMany({
          where: {
            zoneId,
            checkinAt: { lt: todayEndExclusive },
            checkoutAt: { gt: todayStart },
          },
          select: {
            id: true,
            zoneId: true,
            checkinAt: true,
            checkoutAt: true,
          },
        }),
      ]);

      for (const reservation of [...history, ...overlappingToday]) {
        reservationById.set(reservation.id, reservation);
      }
    }),
  );

  const zoneReservations = [...reservationById.values()];
  const reservationsByZone = groupReservationsByZone(zoneReservations);
  const minPrevCheckoutByZone = computeMinPreviousCheckoutByZone(
    eligibleItems,
    reservationsByZone,
  );

  const cleaningResults = await Promise.all(
    zoneBounds.map(async ({ zoneId, maxCheckinAt }) => {
      const minPrevCheckout = minPrevCheckoutByZone.get(zoneId);
      const upperBound =
        maxCheckinAt.getTime() > todayEnd.getTime() ? maxCheckinAt : todayEnd;
      const completedAt: { lte: Date; gte?: Date } = { lte: upperBound };
      if (minPrevCheckout) {
        completedAt.gte = minPrevCheckout;
      }

      return prisma.workOrder.findMany({
        where: {
          zoneId,
          type: WorkOrderType.CHECKOUT_CLEANING,
          status: WorkOrderStatus.COMPLETED,
          deletedAt: null,
          completedAt,
        },
        orderBy: { completedAt: 'desc' },
        ...(minPrevCheckout ? {} : { take: CLEANING_HISTORY_LIMIT }),
        select: { zoneId: true, completedAt: true },
      });
    }),
  );

  const zoneCleanings = cleaningResults
    .flat()
    .filter(
      (item): item is { zoneId: string; completedAt: Date } =>
        item.zoneId != null && item.completedAt != null,
    )
    .map((item) => ({
      zoneId: item.zoneId,
      completedAt: item.completedAt,
    }));

  return { zoneReservations, zoneCleanings };
}

function groupReservationsByZone(
  reservations: ZoneReservationSnapshot[],
): Map<string, ZoneReservationSnapshot[]> {
  const reservationsByZone = new Map<string, ZoneReservationSnapshot[]>();
  for (const reservation of reservations) {
    const list = reservationsByZone.get(reservation.zoneId) ?? [];
    list.push(reservation);
    reservationsByZone.set(reservation.zoneId, list);
  }
  for (const list of reservationsByZone.values()) {
    list.sort((a, b) => b.checkoutAt.getTime() - a.checkoutAt.getTime());
  }
  return reservationsByZone;
}

function computeMinPreviousCheckoutByZone(
  eligibleItems: ReservationReadinessInput[],
  reservationsByZone: Map<string, ZoneReservationSnapshot[]>,
): Map<string, Date> {
  const minPrevCheckoutByZone = new Map<string, Date>();

  for (const item of eligibleItems) {
    const zoneReservations = reservationsByZone.get(item.zoneId) ?? [];
    const previousReservation = findPreviousZoneReservation(item, zoneReservations);
    if (!previousReservation) continue;

    const current = minPrevCheckoutByZone.get(item.zoneId);
    if (!current || previousReservation.checkoutAt < current) {
      minPrevCheckoutByZone.set(item.zoneId, previousReservation.checkoutAt);
    }
  }

  return minPrevCheckoutByZone;
}
