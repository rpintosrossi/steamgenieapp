'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import { BuildingTransferList } from './BuildingTransferList';
import type { UserBuildingRoleItem } from '../lib/types';

interface AssignBuildingsModalProps {
  userId: string;
  userFullName: string;
  userDni: string;
  buildings: Array<{ id: string; name: string }>;
  buildingRoles: UserBuildingRoleItem[];
  excludedBuildingIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function AssignBuildingsModal({
  userId,
  userFullName,
  userDni,
  buildings,
  buildingRoles,
  excludedBuildingIds,
  onClose,
  onSaved,
}: AssignBuildingsModalProps) {
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogIds = useMemo(() => new Set(buildings.map((building) => building.id)), [buildings]);

  useEffect(() => {
    const hasGlobal = buildingRoles.some((role) => role.buildingId === null);
    const assignedIds = buildingRoles
      .map((role) => role.buildingId)
      .filter((id): id is string => typeof id === 'string' && catalogIds.has(id));
    const savedExcluded = excludedBuildingIds.filter((id) => catalogIds.has(id));

    if (savedExcluded.length > 0 || hasGlobal || assignedIds.length === 0) {
      setExcludedIds(savedExcluded);
      return;
    }

    // Allowlist legado: lo no asignado se muestra como excluido.
    setExcludedIds(buildings.map((building) => building.id).filter((id) => !assignedIds.includes(id)));
  }, [buildingRoles, buildings, catalogIds, excludedBuildingIds]);

  const visibleBuildings = useMemo(
    () =>
      buildings
        .filter((building) => !excludedIds.includes(building.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [buildings, excludedIds],
  );

  const excludedBuildings = useMemo(
    () =>
      excludedIds
        .map((id) => buildings.find((building) => building.id === id))
        .filter((building): building is { id: string; name: string } => Boolean(building))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [buildings, excludedIds],
  );

  function excludeBuilding(buildingId: string) {
    setExcludedIds((prev) => (prev.includes(buildingId) ? prev : [...prev, buildingId]));
  }

  function includeBuilding(buildingId: string) {
    setExcludedIds((prev) => prev.filter((id) => id !== buildingId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put(`/users/${userId}/excluded-buildings`, {
        buildingIds: excludedIds,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las exclusiones');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Excluir sucursales</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          {userFullName} · DNI {userDni}
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <p className="muted" style={{ marginTop: 0 }}>
            Por defecto el usuario ve todas las sucursales. Pasá a la derecha las que no debe ver.
            Aplica a presupuestos, servicios, calendario, trabajos, stock, presencia y el resto de
            la app. También vale para administradores.
          </p>

          <BuildingTransferList
            available={visibleBuildings}
            assigned={excludedBuildings}
            onAssign={excludeBuilding}
            onUnassign={includeBuilding}
            onAssignAll={() => setExcludedIds(buildings.map((building) => building.id))}
            onUnassignAll={() => setExcludedIds([])}
            disabled={saving}
            availableTitle="Visibles"
            assignedTitle="Excluidas"
            assignAllLabel="Excluir todas"
            unassignAllLabel="Quitar todas"
            availableEmptyLabel="Ninguna sucursal visible"
            assignedEmptyLabel="Sin exclusiones: ve todas"
            assignTitle="Excluir sucursal"
            unassignTitle="Volver a mostrar"
          />

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar exclusiones'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
