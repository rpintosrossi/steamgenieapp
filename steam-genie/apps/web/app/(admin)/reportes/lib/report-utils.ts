export const REPORT_PAGE_SIZE = 20;
export const MAX_REPORT_RANGE_DAYS = 90;

export function defaultReportDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(value: string | Date | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR');
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

export function toReportIsoRange(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: new Date(`${dateFrom}T00:00:00`).toISOString(),
    dateTo: new Date(`${dateTo}T23:59:59`).toISOString(),
  };
}

export function buildReportExportFilename(prefix: string, dateFrom: string, dateTo: string): string {
  return `${prefix}_${dateFrom}_${dateTo}.csv`;
}
