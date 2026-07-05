'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import { getUserIdsForRole, UserTransferList } from './UserTransferList';
import { ROLE_LABELS } from '../lib/labels';
import type {
  BuildingUserRolesResponse,
  Paginated,
  RoleItem,
  UserItem,
} from '../lib/types';

interface AssignUsersModalProps {
  buildingId: string;
  buildingName: string;
  roles: RoleItem[];
  buildingUserRoles: BuildingUserRolesResponse;
  onClose: () => void;
  onSaved: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULT_LIMIT = 50;

function toUserOption(user: { id: string; fullName: string; dni: string }) {
  return { id: user.id, fullName: user.fullName, dni: user.dni };
}

export function AssignUsersModal({
  buildingId,
  buildingName,
  roles,
  buildingUserRoles,
  onClose,
  onSaved,
}: AssignUsersModalProps) {
  const defaultRoleId = roles.find((r) => r.name === 'cleaner')?.id ?? roles[0]?.id ?? '';

  const [roleId, setRoleId] = useState(defaultRoleId);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [assignedLabels, setAssignedLabels] = useState<Map<string, { fullName: string; dni: string }>>(
    () => new Map(),
  );
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<UserItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ids = getUserIdsForRole(buildingUserRoles.assignments, roleId);
    setAssignedIds(ids);

    const labels = new Map<string, { fullName: string; dni: string }>();
    for (const assignment of buildingUserRoles.assignments) {
      if (assignment.role.id === roleId) {
        labels.set(assignment.userId, {
          fullName: assignment.user.fullName,
          dni: assignment.user.dni,
        });
      }
    }
    setAssignedLabels(labels);
  }, [buildingUserRoles.assignments, roleId]);

  useEffect(() => {
    const query = searchInput.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        search: query,
        isActive: 'true',
        limit: String(SEARCH_RESULT_LIMIT),
        page: '1',
      });

      void api
        .get<Paginated<UserItem>>(`/users?${params.toString()}`)
        .then((res) => setSearchResults(res.data))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const assignedUsers = useMemo(
    () =>
      assignedIds
        .map((id) => {
          const label = assignedLabels.get(id);
          return label ? toUserOption({ id, ...label }) : null;
        })
        .filter((user): user is { id: string; fullName: string; dni: string } => Boolean(user))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [assignedIds, assignedLabels],
  );

  const availableUsers = useMemo(
    () =>
      searchResults
        .filter((user) => !assignedIds.includes(user.id))
        .map(toUserOption)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [assignedIds, searchResults],
  );

  function assignUser(userId: string) {
    const fromSearch = searchResults.find((user) => user.id === userId);
    if (fromSearch) {
      setAssignedLabels((prev) => {
        const next = new Map(prev);
        next.set(userId, { fullName: fromSearch.fullName, dni: fromSearch.dni });
        return next;
      });
    }
    setAssignedIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
  }

  function unassignUser(userId: string) {
    setAssignedIds((prev) => prev.filter((id) => id !== userId));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roleId) return;

    setSaving(true);
    setError(null);
    try {
      await api.put(`/buildings/${buildingId}/user-roles/bulk`, {
        roleId,
        userIds: assignedIds,
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
          <h2 className="modal-title">Gestionar acceso al edificio</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          {buildingName}
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
              Los usuarios de la derecha tendrán acceso a este edificio con el rol seleccionado.
            </p>
          </div>

          <div className="form-field">
            <label>Buscar usuarios para agregar</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre o DNI (mín. 2 caracteres)"
              disabled={saving}
            />
            {searching ? (
              <p className="muted">Buscando…</p>
            ) : searchInput.trim().length >= 2 && availableUsers.length === 0 ? (
              <p className="muted">No se encontraron usuarios con ese criterio.</p>
            ) : searchInput.trim().length < 2 ? (
              <p className="muted">Escribí al menos 2 caracteres para buscar usuarios disponibles.</p>
            ) : null}
          </div>

          <UserTransferList
            available={availableUsers}
            assigned={assignedUsers}
            onAssign={assignUser}
            onUnassign={unassignUser}
            onAssignAll={
              searchInput.trim().length >= 2 && availableUsers.length > 0
                ? () => {
                    const newLabels = new Map(assignedLabels);
                    for (const user of availableUsers) {
                      newLabels.set(user.id, { fullName: user.fullName, dni: user.dni });
                    }
                    setAssignedLabels(newLabels);
                    setAssignedIds((prev) => [
                      ...prev,
                      ...availableUsers.map((user) => user.id).filter((id) => !prev.includes(id)),
                    ]);
                  }
                : undefined
            }
            onUnassignAll={() => setAssignedIds([])}
            disabled={saving}
          />

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar accesos'}
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
