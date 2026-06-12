/** Zona horaria de negocio para fechas de calendario (día de checkout, etc.). */
export const BUSINESS_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** YYYY-MM-DD en la zona de negocio a partir de un instante. */
export function calendarDateKeyInBusinessTz(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Medianoche UTC para Prisma `@db.Date` a partir de YYYY-MM-DD. */
export function utcDateFromCalendarKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Fecha de calendario (UTC midnight) del instante en la zona de negocio. */
export function calendarDateFromInstant(instant: Date): Date {
  return utcDateFromCalendarKey(calendarDateKeyInBusinessTz(instant));
}

/** Partes de una fecha guardada como `@db.Date` (siempre leer en UTC). */
export function parseStoredCalendarDate(value: string | Date): {
  y: number;
  m: number;
  d: number;
} {
  const date = typeof value === 'string' ? new Date(value) : value;
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

/** Formatea una fecha de calendario almacenada (no un instante con hora). */
export function formatStoredCalendarDate(
  value: string | Date | null | undefined,
  locale = 'es-AR',
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_FORMAT,
): string {
  if (!value) return '—';
  const { y, m, d } = parseStoredCalendarDate(value);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(locale, options);
}

/** Fin del día calendario en la zona de negocio (23:59:59.999). */
export function endOfStoredCalendarDateInBusinessTz(value: string | Date): Date {
  const { y, m, d } = parseStoredCalendarDate(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = `${y}-${pad(m)}-${pad(d)}`;

  // Argentina no usa DST desde 2009; offset fijo -03:00.
  return new Date(`${key}T23:59:59.999-03:00`);
}
