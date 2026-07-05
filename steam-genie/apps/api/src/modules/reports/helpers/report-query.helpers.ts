import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';

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

export async function resolveAccessibleBuildingIds(
  prisma: PrismaService,
  userId: string,
  buildingId?: string,
): Promise<string[]> {
  const assignments = await prisma.userBuildingRole.findMany({
    where: { userId },
    select: { buildingId: true },
  });

  const hasGlobal = assignments.some((a) => a.buildingId === null);
  if (hasGlobal) {
    if (buildingId) return [buildingId];
    const buildings = await prisma.building.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    return buildings.map((b) => b.id);
  }

  const scopedIds = [
    ...new Set(
      assignments
        .map((a) => a.buildingId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (buildingId) {
    if (!scopedIds.includes(buildingId)) {
      throw new ForbiddenException('No tenés acceso a este edificio.');
    }
    return [buildingId];
  }

  if (scopedIds.length === 0) {
    throw new ForbiddenException('No tenés edificios asignados.');
  }

  return scopedIds;
}

export async function assertBuildingAccess(
  prisma: PrismaService,
  userId: string,
  buildingId: string,
): Promise<void> {
  await resolveAccessibleBuildingIds(prisma, userId, buildingId);
}

export function buildingIdFilter(buildingIds: string[]): string | { in: string[] } {
  return buildingIds.length === 1 ? buildingIds[0]! : { in: buildingIds };
}
