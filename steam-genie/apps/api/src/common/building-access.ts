import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../infrastructure/prisma/prisma.service';

export type BuildingAccessScope = {
  /** Rol global (buildingId = null): ve todos salvo exclusiones. */
  hasGlobalAccess: boolean;
  /** Allowlist legado: edificios con rol acotado. */
  scopedIds: string[];
  excludedIds: string[];
};

type BuildingIdWhere = {
  buildingId?: unknown;
  AND?: unknown;
};

export async function loadBuildingAccessScope(
  prisma: PrismaService,
  userId: string,
): Promise<BuildingAccessScope> {
  const [assignments, exclusions] = await Promise.all([
    prisma.userBuildingRole.findMany({
      where: { userId },
      select: { buildingId: true },
    }),
    prisma.userExcludedBuilding.findMany({
      where: { userId },
      select: { buildingId: true },
    }),
  ]);

  const hasGlobalAccess = assignments.some((row) => row.buildingId === null);
  const scopedIds = [
    ...new Set(
      assignments
        .map((row) => row.buildingId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const excludedIds = [...new Set(exclusions.map((row) => row.buildingId))];

  return { hasGlobalAccess, scopedIds, excludedIds };
}

export function isBuildingAccessible(scope: BuildingAccessScope, buildingId: string): boolean {
  if (scope.excludedIds.includes(buildingId)) return false;
  if (scope.hasGlobalAccess) return true;
  return scope.scopedIds.includes(buildingId);
}

export async function resolveAccessibleBuildingIds(
  prisma: PrismaService,
  userId: string,
  buildingId?: string,
): Promise<string[]> {
  const scope = await loadBuildingAccessScope(prisma, userId);

  if (buildingId) {
    if (!isBuildingAccessible(scope, buildingId)) {
      throw new ForbiddenException('No tenés acceso a este edificio.');
    }
    return [buildingId];
  }

  if (scope.hasGlobalAccess) {
    const buildings = await prisma.building.findMany({
      where: {
        deletedAt: null,
        ...(scope.excludedIds.length > 0 ? { id: { notIn: scope.excludedIds } } : {}),
      },
      select: { id: true },
    });
    return buildings.map((building) => building.id);
  }

  const scopedIds = scope.scopedIds.filter((id) => !scope.excludedIds.includes(id));
  if (scopedIds.length === 0) {
    throw new ForbiddenException('No tenés edificios asignados.');
  }

  return scopedIds;
}

export async function listAccessibleBuildingIds(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  try {
    return await resolveAccessibleBuildingIds(prisma, userId);
  } catch {
    return [];
  }
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

/**
 * Cruza un where.buildingId existente con el alcance del usuario.
 * Devuelve false si no queda ningún edificio accesible.
 */
export function mergeBuildingIdConstraint(
  where: BuildingIdWhere,
  scope: BuildingAccessScope,
  options?: { allowNull?: boolean },
): boolean {
  const allowNull = options?.allowNull ?? false;
  const existing = where.buildingId;

  if (typeof existing === 'string') {
    return isBuildingAccessible(scope, existing);
  }

  if (existing && typeof existing === 'object' && 'in' in existing) {
    const requested = (existing as { in: unknown }).in;
    if (Array.isArray(requested)) {
      const next = requested.filter(
        (id): id is string => typeof id === 'string' && isBuildingAccessible(scope, id),
      );
      if (next.length === 0) return false;
      where.buildingId = next.length === 1 ? next[0] : { in: next };
      return true;
    }
  }

  if (existing && typeof existing === 'object' && 'notIn' in existing) {
    const requested = (existing as { notIn: unknown }).notIn;
    const extra = Array.isArray(requested)
      ? requested.filter((id): id is string => typeof id === 'string')
      : [];
    const notIn = [...new Set([...extra, ...scope.excludedIds])];
    if (!scope.hasGlobalAccess) {
      const ids = scope.scopedIds.filter((id) => !notIn.includes(id));
      if (ids.length === 0) return false;
      where.buildingId = ids.length === 1 ? ids[0] : { in: ids };
      return true;
    }
    where.buildingId = { notIn };
    return true;
  }

  if (scope.hasGlobalAccess) {
    if (scope.excludedIds.length === 0) return true;
    if (allowNull) {
      appendAnd(where, {
        OR: [{ buildingId: null }, { buildingId: { notIn: scope.excludedIds } }],
      });
      return true;
    }
    where.buildingId = { notIn: scope.excludedIds };
    return true;
  }

  const ids = scope.scopedIds.filter((id) => !scope.excludedIds.includes(id));
  if (ids.length === 0) return false;
  const idFilter = ids.length === 1 ? ids[0] : { in: ids };
  if (allowNull) {
    appendAnd(where, {
      OR: [{ buildingId: null }, { buildingId: idFilter }],
    });
    return true;
  }
  where.buildingId = idFilter;
  return true;
}

export function applyBuildingRecordConstraint(
  where: { id?: unknown },
  scope: BuildingAccessScope,
): 'ok' | 'empty' {
  const existing = where.id;
  if (typeof existing === 'string') {
    return isBuildingAccessible(scope, existing) ? 'ok' : 'empty';
  }

  if (scope.hasGlobalAccess) {
    if (scope.excludedIds.length > 0) {
      where.id = { notIn: scope.excludedIds };
    }
    return 'ok';
  }

  const ids = scope.scopedIds.filter((id) => !scope.excludedIds.includes(id));
  if (ids.length === 0) return 'empty';
  where.id = { in: ids };
  return 'ok';
}

export function filterRequestedBuildingIds(
  scope: BuildingAccessScope,
  requested: string[],
): string[] {
  return requested.filter((id) => isBuildingAccessible(scope, id));
}

function appendAnd(where: BuildingIdWhere, clause: unknown) {
  const current = where.AND;
  const list = Array.isArray(current) ? current : current ? [current] : [];
  where.AND = [...list, clause];
}
