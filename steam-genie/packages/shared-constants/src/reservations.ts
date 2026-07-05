import {
  businessDayInstantRange,
  calendarDateKeyInBusinessTz,
} from './calendar-dates';
import { RESERVATION_STATUS } from './statuses';

export type ReservationStatusValue =
  (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS];

export interface ZoneReadinessFlags {
  /** Limpieza registrada antes del check-in de esta reserva. */
  readyToOccupy: boolean;
  /** Sin limpieza desde el último checkout de la zona hasta hoy, o zona con reserva activa. */
  notReady: boolean;
}

export interface ReservationReadinessInput {
  id: string;
  zoneId: string;
  checkinAt: Date;
  checkoutAt: Date;
}

export interface ZoneReservationSnapshot {
  id: string;
  zoneId: string;
  checkinAt: Date;
  checkoutAt: Date;
}

export interface ZoneCleaningSnapshot {
  zoneId: string;
  completedAt: Date;
}

export interface ZoneReadinessIndex {
  reservationsByZone: ReadonlyMap<string, readonly ZoneReservationSnapshot[]>;
  cleaningsByZone: ReadonlyMap<string, readonly Date[]>;
  todayEnd: Date;
  now: Date;
}

/** Estado operativo de una reserva según el día calendario en la zona de negocio. */
export function deriveReservationStatus(
  checkinAt: Date,
  checkoutAt: Date,
  now: Date = new Date(),
): ReservationStatusValue {
  const today = calendarDateKeyInBusinessTz(now);
  const checkinDay = calendarDateKeyInBusinessTz(checkinAt);
  const checkoutDay = calendarDateKeyInBusinessTz(checkoutAt);

  if (today < checkinDay) return RESERVATION_STATUS.UPCOMING;
  if (today === checkinDay) return RESERVATION_STATUS.CHECKIN_DAY;
  if (today > checkoutDay) return RESERVATION_STATUS.COMPLETED;
  if (today === checkoutDay) return RESERVATION_STATUS.CHECKOUT_DAY;
  return RESERVATION_STATUS.ACTIVE;
}

export function showsZoneReadiness(status: ReservationStatusValue): boolean {
  return (
    status === RESERVATION_STATUS.UPCOMING ||
    status === RESERVATION_STATUS.CHECKIN_DAY
  );
}

export function endOfBusinessCalendarDay(now: Date = new Date()): Date {
  const { end } = businessDayInstantRange(calendarDateKeyInBusinessTz(now));
  return new Date(end.getTime() - 1);
}

export function findPreviousZoneReservation(
  reservation: ReservationReadinessInput,
  zoneReservations: readonly ZoneReservationSnapshot[],
): ZoneReservationSnapshot | undefined {
  for (const item of zoneReservations) {
    if (item.id === reservation.id) continue;
    if (item.checkoutAt < reservation.checkinAt) return item;
  }
  return undefined;
}

export function buildZoneReadinessIndex(
  zoneReservations: readonly ZoneReservationSnapshot[],
  zoneCleanings: readonly ZoneCleaningSnapshot[],
  now: Date = new Date(),
): ZoneReadinessIndex {
  const reservationsByZone = new Map<string, ZoneReservationSnapshot[]>();
  for (const reservation of zoneReservations) {
    const list = reservationsByZone.get(reservation.zoneId) ?? [];
    list.push(reservation);
    reservationsByZone.set(reservation.zoneId, list);
  }
  for (const list of reservationsByZone.values()) {
    list.sort((a, b) => b.checkoutAt.getTime() - a.checkoutAt.getTime());
  }

  const cleaningsByZone = new Map<string, Date[]>();
  for (const cleaning of zoneCleanings) {
    const list = cleaningsByZone.get(cleaning.zoneId) ?? [];
    list.push(cleaning.completedAt);
    cleaningsByZone.set(cleaning.zoneId, list);
  }

  return {
    reservationsByZone,
    cleaningsByZone,
    todayEnd: endOfBusinessCalendarDay(now),
    now,
  };
}

export function computeZoneReadinessFromIndex(
  reservation: ReservationReadinessInput,
  index: ZoneReadinessIndex,
  status: ReservationStatusValue,
): ZoneReadinessFlags | null {
  if (!showsZoneReadiness(status)) return null;

  const zoneReservations =
    index.reservationsByZone.get(reservation.zoneId) ?? [];
  const cleanings = index.cleaningsByZone.get(reservation.zoneId) ?? [];
  const previousReservation = findPreviousZoneReservation(
    reservation,
    zoneReservations,
  );

  let hasActiveReservation = false;
  for (const item of zoneReservations) {
    if (item.id === reservation.id) continue;
    if (
      deriveReservationStatus(item.checkinAt, item.checkoutAt, index.now) ===
      RESERVATION_STATUS.ACTIVE
    ) {
      hasActiveReservation = true;
      break;
    }
  }

  const readyToOccupy = cleanings.some((completedAt) => {
    if (completedAt >= reservation.checkinAt) return false;
    if (previousReservation && completedAt < previousReservation.checkoutAt) {
      return false;
    }
    return true;
  });

  let missingCleaningSinceCheckout = false;
  if (previousReservation) {
    const cleanedSinceCheckout = cleanings.some(
      (completedAt) =>
        completedAt > previousReservation.checkoutAt &&
        completedAt <= index.todayEnd,
    );
    missingCleaningSinceCheckout = !cleanedSinceCheckout;
  }

  return {
    readyToOccupy,
    notReady: hasActiveReservation || missingCleaningSinceCheckout,
  };
}

/** @deprecated Prefer `computeZoneReadinessFromIndex` con datos ya agrupados. */
export function computeZoneReadiness(
  reservation: ReservationReadinessInput,
  zoneReservations: ZoneReservationSnapshot[],
  zoneCleanings: ZoneCleaningSnapshot[],
  now: Date = new Date(),
): ZoneReadinessFlags | null {
  const status = deriveReservationStatus(
    reservation.checkinAt,
    reservation.checkoutAt,
    now,
  );
  const index = buildZoneReadinessIndex(zoneReservations, zoneCleanings, now);
  return computeZoneReadinessFromIndex(reservation, index, status);
}
