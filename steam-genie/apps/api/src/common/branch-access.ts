import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../infrastructure/prisma/prisma.service';

export type BranchAccessScope = {
  excludedIds: string[];
};

export async function loadBranchAccessScope(
  prisma: PrismaService,
  userId: string,
): Promise<BranchAccessScope> {
  const exclusions = await prisma.userExcludedBranch.findMany({
    where: { userId },
    select: { branchId: true },
  });
  return { excludedIds: [...new Set(exclusions.map((row) => row.branchId))] };
}

export function isBranchAccessible(scope: BranchAccessScope, branchId: string): boolean {
  return !scope.excludedIds.includes(branchId);
}

/** null = todas las sucursales (sin exclusiones). */
export async function resolveAccessibleBranchIds(
  prisma: PrismaService,
  userId: string,
  requestedId?: string,
): Promise<string[] | null> {
  const scope = await loadBranchAccessScope(prisma, userId);

  if (requestedId) {
    if (!isBranchAccessible(scope, requestedId)) {
      throw new ForbiddenException('No tenés acceso a esta sucursal.');
    }
    return [requestedId];
  }

  if (scope.excludedIds.length === 0) return null;

  const branches = await prisma.quoteBranch.findMany({
    where: { deletedAt: null, id: { notIn: scope.excludedIds } },
    select: { id: true },
  });
  return branches.map((branch) => branch.id);
}

export async function listAccessibleBranchIds(
  prisma: PrismaService,
  userId: string,
): Promise<string[] | null> {
  try {
    return await resolveAccessibleBranchIds(prisma, userId);
  } catch {
    return [];
  }
}

type BranchIdWhere = {
  branchId?: unknown;
  AND?: unknown;
};

export function mergeBranchIdConstraint(
  where: BranchIdWhere,
  accessibleIds: string[] | null,
  requestedId?: string,
): boolean {
  if (requestedId) {
    if (accessibleIds && !accessibleIds.includes(requestedId)) return false;
    where.branchId = requestedId;
    return true;
  }

  if (accessibleIds === null) return true;
  if (accessibleIds.length === 0) return false;

  const existing = where.branchId;
  if (typeof existing === 'string') {
    return accessibleIds.includes(existing);
  }
  if (existing && typeof existing === 'object' && 'in' in existing) {
    const requested = (existing as { in: unknown }).in;
    if (Array.isArray(requested)) {
      const next = requested.filter(
        (id): id is string => typeof id === 'string' && accessibleIds.includes(id),
      );
      if (next.length === 0) return false;
      where.branchId = next.length === 1 ? next[0] : { in: next };
      return true;
    }
  }

  where.branchId = accessibleIds.length === 1 ? accessibleIds[0] : { in: accessibleIds };
  return true;
}
