'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import { getBuildingIdsForRole } from './BuildingCheckboxGrid';
import { BuildingTransferList } from './BuildingTransferList';
import { ROLE_LABELS } from '../lib/labels';
import type { RoleItem, UserBuildingRoleItem } from '../lib/types';

interface AssignBuildingsModalProps {
  userId: string;
  userFullName: string;
  userDni: string;
  primaryRole: string;
  roles: RoleItem[];
  buildings: Array<{ id: string; name: string }>;
  buildingRoles: UserBuildingRoleItem[];
  onClose: () => void;
  onSaved: () => void;
}

export function AssignBuildingsModal({
  userId,
  userFullName,
  userDni,
  primaryRole,
  roles,
  buildings,
  buildingRoles,
  onClose,
  onSaved,
}: AssignBuildingsModalProps) {
  const defaultRoleId = roles.find((r) => r.name === primaryRole)?.id ?? roles[0]?.id ?? '';

  const [roleId, setRoleId] = useState(defaultRoleId);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAssignedIds(getBuildingIdsForRole(buildingRoles, roleId));
  }, [buildingRoles, roleId]);

  const assignedBuildings = useMemo(
    () =>
      assignedIds
        .map((id) => buildings.find((b) => b.id === id))
        .filter((b): b is { id: string; name: string } => Boolean(b))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [assignedIds, buildings],
  );

  const availableBuildings = useMemo(
    () =>
      buildings
        .filter((b) => !assignedIds.includes(b.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [assignedIds, buildings],
  );

  function assignBuilding(buildingId: string) {
    setAssignedIds((prev) => (prev.includes(buildingId) ? prev : [...prev, buildingId]));
  }

  function unassignBuilding(buildingId: string) {
    setAssignedIds((prev) => prev.filter((id) => id !== buildingId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roleId) return;

    setSaving(true);
    setError(null);
    try {
      await api.put(`/users/${userId}/building-roles/bulk`, {
        roleId,
        buildingIds: assignedIds,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las asignaciones');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Asignar edificios</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          {userFullName} · DNI {userDni}
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <div className="form-field">
            <label>Rol a asignar</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {ROLE_LABELS[role.name] ?? role.name}
                </option>
              ))}
            </select>
            <p className="muted">
              Los edificios de la derecha quedarán vinculados a este rol. Tocá un edificio para
              moverlo de un lado al otro.
            </p>
          </div>

          <BuildingTransferList
            available={availableBuildings}
            assigned={assignedBuildings}
            onAssign={assignBuilding}
            onUnassign={unassignBuilding}
            onAssignAll={() => setAssignedIds(buildings.map((b) => b.id))}
            onUnassignAll={() => setAssignedIds([])}
            disabled={saving}
          />

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar asignaciones'}
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
