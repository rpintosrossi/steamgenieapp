'use client';

import { useMemo, useState } from 'react';
import { ROLE_LABELS } from '../lib/labels';

interface BuildingOption {
  id: string;
  name: string;
}

interface BuildingCheckboxGridProps {
  buildings: BuildingOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function BuildingCheckboxGrid({
  buildings,
  selectedIds,
  onChange,
  disabled = false,
}: BuildingCheckboxGridProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    if (!query) return buildings;
    return buildings.filter((b) => normalize(b.name).includes(query));
  }, [buildings, search]);

  function toggle(buildingId: string) {
    if (disabled) return;
    if (selectedIds.includes(buildingId)) {
      onChange(selectedIds.filter((id) => id !== buildingId));
    } else {
      onChange([...selectedIds, buildingId]);
    }
  }

  // Los botones operan sobre lo visible: con un filtro activo permiten
  // marcar/quitar solo el subconjunto buscado sin tocar el resto.
  function selectVisible() {
    if (disabled) return;
    const visibleIds = filtered.map((b) => b.id);
    onChange(Array.from(new Set([...selectedIds, ...visibleIds])));
  }

  function clearVisible() {
    if (disabled) return;
    const visibleIds = new Set(filtered.map((b) => b.id));
    onChange(selectedIds.filter((id) => !visibleIds.has(id)));
  }

  if (buildings.length === 0) {
    return <p className="muted">No hay edificios disponibles.</p>;
  }

  const filtering = search.trim().length > 0;

  return (
    <div className="building-picker">
      <input
        type="search"
        className="building-picker-search"
        placeholder="Buscar edificio…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled}
        autoComplete="off"
      />
      <div className="building-picker-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={selectVisible} disabled={disabled}>
          {filtering ? 'Marcar visibles' : 'Marcar todos'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={clearVisible} disabled={disabled}>
          {filtering ? 'Quitar visibles' : 'Quitar todos'}
        </button>
        <span className="muted">{selectedIds.length} seleccionado(s)</span>
      </div>
      {filtered.length === 0 ? (
        <p className="muted">Ningún edificio coincide con «{search.trim()}».</p>
      ) : (
        <div className="checkbox-grid">
          {filtered.map((building) => (
            <label key={building.id} className="checkbox-item">
              <input
                type="checkbox"
                checked={selectedIds.includes(building.id)}
                onChange={() => toggle(building.id)}
                disabled={disabled}
              />
              <span>{building.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function buildInitialRoles(roleId: string, buildingIds: string[]) {
  if (!roleId) return undefined;
  if (buildingIds.length === 0) return [{ roleId }];
  return buildingIds.map((buildingId) => ({ roleId, buildingId }));
}

export function getBuildingIdsForRole(
  assignments: Array<{ role: { id: string }; buildingId: string | null }>,
  roleId: string,
): string[] {
  return assignments
    .filter((item) => item.role.id === roleId && item.buildingId)
    .map((item) => item.buildingId as string);
}

export function summarizeUserBuildings(
  assignments: Array<{
    buildingId: string | null;
    building?: { name: string } | null;
  }>,
): string {
  const scoped = assignments.filter((item) => item.buildingId && item.building?.name);

  if (scoped.length === 0) {
    const hasGlobal = assignments.some((item) => !item.buildingId);
    return hasGlobal ? 'Global' : '—';
  }

  if (scoped.length === 1) return '1 edificio';
  return `${scoped.length} edificios`;
}

export function formatUserBuildings(
  assignments: Array<{
    buildingId: string | null;
    building: { name: string } | null;
    role?: { name: string };
  }>,
): string {
  const scoped = assignments.filter((item) => item.buildingId && item.building?.name);

  if (scoped.length === 0) {
    const hasGlobal = assignments.some((item) => !item.buildingId);
    return hasGlobal ? 'Global' : '—';
  }

  const labels = scoped.map((item) => {
    const roleLabel = item.role?.name ? (ROLE_LABELS[item.role.name] ?? item.role.name) : null;
    const buildingName = item.building!.name.trim();
    return roleLabel ? `${roleLabel} · ${buildingName}` : buildingName;
  });

  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}
