export interface ReservationLocationRef {
  name: string;
}

export interface CheckoutReservationInfo {
  guestName?: string | null;
  checkinAt: string;
  checkoutAt: string;
  externalId?: string | null;
  status?: string;
  floor?: ReservationLocationRef | null;
  zone?: ReservationLocationRef | null;
  subzone?: ReservationLocationRef | null;
}

export interface WorkOrderLocationRefs {
  floor?: ReservationLocationRef | null;
  zone?: ReservationLocationRef | null;
  subzone?: ReservationLocationRef | null;
}

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Próxima',
  CHECKIN_DAY: 'Día de check-in',
  ACTIVE: 'En curso',
  CHECKOUT_DAY: 'Día de checkout',
  COMPLETED: 'Finalizada',
};

export function getReservationStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  return RESERVATION_STATUS_LABELS[status] ?? status;
}

export function formatReservationDateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatReservationLocation(
  reservation: CheckoutReservationInfo,
  workOrder?: WorkOrderLocationRefs,
): string {
  const floor = reservation.floor?.name ?? workOrder?.floor?.name;
  const zone = reservation.zone?.name ?? workOrder?.zone?.name;
  const subzone = reservation.subzone?.name ?? workOrder?.subzone?.name;

  const parts = [floor, zone, subzone].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}
