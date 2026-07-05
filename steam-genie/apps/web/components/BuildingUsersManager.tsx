'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import { AssignUsersModal } from './AssignUsersModal';
import { ROLE_LABELS } from '../lib/labels';
import type { BuildingUserRolesResponse, RoleItem } from '../lib/types';

interface BuildingUsersManagerProps {
  buildingId: string;
  buildingName: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function BuildingUsersManager({
  buildingId,
  buildingName,
  onError,
  onSuccess,
}: BuildingUsersManagerProps) {
  const [data, setData] = useState<BuildingUserRolesResponse | null>(null);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingModal, setLoadingModal] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userRoles = await api.get<BuildingUserRolesResponse>(
        `/buildings/${buildingId}/user-roles`,
      );
      setData(userRoles);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios del edificio');
    } finally {
      setLoading(false);
    }
  }, [buildingId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignmentsByUser = useMemo(() => {
    if (!data) return new Map<string, string[]>();

    const map = new Map<string, string[]>();
    for (const assignment of data.assignments) {
      const roleLabel = ROLE_LABELS[assignment.role.name] ?? assignment.role.name;
      const current = map.get(assignment.userId) ?? [];
      if (!current.includes(roleLabel)) {
        map.set(assignment.userId, [...current, roleLabel]);
      }
    }
    return map;
  }, [data]);

  const uniqueAssignments = useMemo(() => {
    if (!data) return [];

    const seen = new Set<string>();
    return data.assignments.filter((assignment) => {
      if (seen.has(assignment.userId)) return false;
      seen.add(assignment.userId);
      return true;
    });
  }, [data]);

  async function openManageModal() {
    setLoadingModal(true);
    onError('');
    try {
      const [userRoles, rolesRes] = await Promise.all([
        api.get<BuildingUserRolesResponse>(`/buildings/${buildingId}/user-roles`),
        api.get<RoleItem[]>('/roles'),
      ]);
      setData(userRoles);
      setRoles(rolesRes);
      setModalOpen(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudieron cargar los datos');
    } finally {
      setLoadingModal(false);
    }
  }

  function handleSaved() {
    setModalOpen(false);
    onSuccess('Accesos actualizados correctamente.');
    void load();
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="card-title">Usuarios con acceso</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Administrá qué usuarios pueden operar en este edificio y con qué rol.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void openManageModal()}
            disabled={loading || loadingModal}
          >
            {loadingModal ? 'Cargando…' : 'Gestionar acceso'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" role="status" aria-label="Cargando" />
          <p className="muted">Cargando accesos…</p>
        </div>
      ) : (
        <>
          {uniqueAssignments.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Todavía no hay usuarios asignados específicamente a este edificio.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>DNI</th>
                    <th>Roles en el edificio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueAssignments.map((assignment) => (
                    <tr key={assignment.userId}>
                      <td>{assignment.user.fullName}</td>
                      <td>{assignment.user.dni}</td>
                      <td>{(assignmentsByUser.get(assignment.userId) ?? []).join(', ')}</td>
                      <td>
                        <span
                          className={`badge ${assignment.user.isActive ? 'badge-success' : ''}`}
                        >
                          {assignment.user.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.globalAccess.length > 0 ? (
            <div className="stack" style={{ marginTop: 16, gap: 8 }}>
              <p className="muted" style={{ margin: 0 }}>
                <strong>Acceso global:</strong> estos usuarios tienen rol global y pueden acceder a
                todos los edificios sin asignación específica.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>DNI</th>
                      <th>Rol global</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.globalAccess.map((item) => (
                      <tr key={item.id}>
                        <td>{item.user.fullName}</td>
                        <td>{item.user.dni}</td>
                        <td>{ROLE_LABELS[item.role.name] ?? item.role.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}

      {modalOpen && data && roles.length > 0 ? (
        <AssignUsersModal
          buildingId={buildingId}
          buildingName={buildingName}
          roles={roles}
          buildingUserRoles={data}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
