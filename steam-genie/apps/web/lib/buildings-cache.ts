'use client';

import { api } from './api-client';
import type { BuildingHierarchy } from './types';

const BUILDINGS_TTL_MS = 5 * 60 * 1000;

let buildingsListCache: {
  data: Array<{ id: string; name: string }>;
  fetchedAt: number;
} | null = null;

const hierarchyCache = new Map<string, BuildingHierarchy>();

export async function fetchBuildingsList(): Promise<Array<{ id: string; name: string }>> {
  const now = Date.now();
  if (buildingsListCache && now - buildingsListCache.fetchedAt < BUILDINGS_TTL_MS) {
    return buildingsListCache.data;
  }

  const res = await api.get<{ data: Array<{ id: string; name: string }> }>(
    '/buildings?limit=100&includeParticularSites=true',
  );
  buildingsListCache = { data: res.data, fetchedAt: now };
  return res.data;
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
