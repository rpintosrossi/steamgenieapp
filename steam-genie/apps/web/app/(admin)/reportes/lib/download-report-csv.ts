import { api } from '../../../../lib/api-client';
import { buildReportExportFilename } from './report-utils';

export async function downloadReportCsv(
  endpoint: string,
  params: URLSearchParams,
  filenamePrefix: string,
  dateFrom: string,
  dateTo: string,
): Promise<void> {
  const filename = buildReportExportFilename(filenamePrefix, dateFrom, dateTo);
  await api.download(`${endpoint}?${params}`, filename);
}
