/** Hora de servicio (@db.Time): suele venir como ISO en 1970-01-01. */
export function formatScheduledTime(value: string | null | undefined): string {
  if (!value) return '—';

  // Ya viene como HH:mm o HH:mm:ss
  const hhmm = value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) return `${hhmm[1]}:${hhmm[2]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  // Prisma TIME se serializa en UTC; leer UTC evita corrimientos TZ.
  const h = String(date.getUTCHours()).padStart(2, '0');
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
