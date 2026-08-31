import { BadRequestException } from '@nestjs/common';

export {
  assertBuildingAccess,
  buildingIdFilter,
  resolveAccessibleBuildingIds,
} from '../../../common/building-access';

export const MAX_REPORT_RANGE_DAYS = 90;
export const MAX_REPORT_PAGE_SIZE = 50;
export const MAX_REPORT_INPUT_ROWS = 10_000;

export type ParsedReportRange = {
  dateFrom: Date;
  endExclusive: Date;
  rangeDays: number;
};

export function parseReportDateRange(dateFromStr: string, dateToStr: string): ParsedReportRange {
  const dateFrom = new Date(dateFromStr);
  const dateTo = new Date(dateToStr);
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
    throw new BadRequestException('dateFrom and dateTo must be valid ISO dates');
  }
  if (dateTo < dateFrom) {
    throw new BadRequestException('dateTo must be on or after dateFrom');
  }

  const endExclusive = new Date(dateTo);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const rangeDays = Math.ceil(
    (endExclusive.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (rangeDays > MAX_REPORT_RANGE_DAYS) {
    throw new BadRequestException(
      `El rango de fechas no puede superar ${MAX_REPORT_RANGE_DAYS} días.`,
    );
  }

  return { dateFrom, endExclusive, rangeDays };
}

export function paginateArray<T>(
  items: T[],
  page: number,
  limit: number,
): { data: T[]; total: number; page: number; limit: number; pages: number } {
  const safeLimit = Math.min(Math.max(limit, 1), MAX_REPORT_PAGE_SIZE);
  const safePage = Math.max(page, 1);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / safeLimit));
  const start = (safePage - 1) * safeLimit;
  return {
    data: items.slice(start, start + safeLimit),
    total,
    page: safePage,
    limit: safeLimit,
    pages,
  };
}

