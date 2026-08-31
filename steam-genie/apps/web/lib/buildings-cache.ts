'use client';

import { api } from './api-client';
import type { BuildingHierarchy } from './types';

const BUILDINGS_TTL_MS = 5 * 60 * 1000;

let buildingsListCache: {
  data: Array<{ id: string; name: string; branchId?: string }>;
  fetchedAt: number;
} | null = null;

const hierarchyCache = new Map<string, BuildingHierarchy>();

const BUILDINGS_PAGE_SIZE = 100;
const BUILDINGS_MAX_PAGES = 50;

export async function fetchBuildingsList(): Promise<
  Array<{ id: string; name: string; branchId?: string }>
> {
  const now = Date.now();
  if (buildingsListCache && now - buildingsListCache.fetchedAt < BUILDINGS_TTL_MS) {
    return buildingsListCache.data;
  }

  const all: Array<{ id: string; name: string; branchId?: string }> = [];
  let page = 1;
  let pages = 1;

  while (page <= pages && page <= BUILDINGS_MAX_PAGES) {
    const res = await api.get<{
      data: Array<{ id: string; name: string; branchId?: string }>;
      pages?: number;
    }>(`/buildings?limit=${BUILDINGS_PAGE_SIZE}&page=${page}&includeParticularSites=true`);

    all.push(...(res.data ?? []));
    pages = typeof res.pages === 'number' && res.pages > 0 ? res.pages : 1;
    if (!res.data?.length) break;
    page += 1;
  }

  const unique = [...new Map(all.map((building) => [building.id, building])).values()];
  buildingsListCache = { data: unique, fetchedAt: now };
  return unique;
}

export function invalidateBuildingsListCache(): void {
  buildingsListCache = null;
}

export async function fetchBuildingHierarchy(buildingId: string): Promise<BuildingHierarchy> {
  const cached = hierarchyCache.get(buildingId);
  if (cached) return cached;

  const data = await api.get<BuildingHierarchy>(`/buildings/${buildingId}/hierarchy`);
  hierarchyCache.set(buildingId, data);
  return data;
}

export function invalidateBuildingHierarchyCache(buildingId?: string): void {
  if (buildingId) {
    hierarchyCache.delete(buildingId);
    return;
  }
  hierarchyCache.clear();
}
