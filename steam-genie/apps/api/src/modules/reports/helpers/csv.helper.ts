export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(rows: string[][]): Buffer {
  const content = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
  return Buffer.from(`\uFEFF${content}`, 'utf-8');
}

export function reportCsvFilename(prefix: string, dateFrom: string, dateTo: string): string {
  const from = dateFrom.slice(0, 10);
  const to = dateTo.slice(0, 10);
  return `${prefix}_${from}_${to}.csv`;
}

export function formatDurationForCsv(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

export function formatReportFieldsForCsv(
  fields: Array<{ label: string; values: string[] }>,
): string {
  if (fields.length === 0) return '';
  return fields.map((f) => `${f.label}: ${f.values.join(', ') || '—'}`).join(' | ');
}

export function formatDateTimeForCsv(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('es-AR');
}
