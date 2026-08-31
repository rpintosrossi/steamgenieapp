'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  calendarDateKeyFromStored,
  formatStoredCalendarDate,
} from '@steam-genie/shared-constants';
import { api } from '../../../lib/api-client';
import { fetchBuildingsList, invalidateBuildingsListCache } from '../../../lib/buildings-cache';
import { AssignBuildingsModal } from '../../../components/AssignBuildingsModal';
import { AssignBranchesModal } from '../../../components/AssignBranchesModal';
import { CreateUserModal } from '../../../components/CreateUserModal';
import { ROLE_LABELS } from '../../../lib/labels';
import type { Paginated, QuoteBranchItem, RoleItem, UserBuildingRoleItem, UserItem } from '../../../lib/types';

interface EditFormState {
  dni: string;
  fullName: string;
  birthDate: string;
  isActive: boolean;
}

interface AssignBuildingsModalState {
  user: UserItem;
  buildings: Array<{ id: string; name: string }>;
  buildingRoles: UserBuildingRoleItem[];
}

interface AssignBranchesModalState {
  user: UserItem;
  branches: QuoteBranchItem[];
  excludedBranchIds: string[];
}

const EMPTY_EDIT: EditFormState = {
  dni: '',
  fullName: '',
  birthDate: '',
  isActive: true,
};

const PAGE_SIZE = 20;

function formatBirthDate(iso?: string | null): string {
  return formatStoredCalendarDate(iso, 'es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function UsersPage() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [assignBuildingsModal, setAssignBuildingsModal] = useState<AssignBuildingsModalState | null>(
    null,
  );
  const [assignBranchesModal, setAssignBranchesModal] = useState<AssignBranchesModalState | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get<Paginated<UserItem>>(`/users?limit=${PAGE_SIZE}&page=${page}`),
        api.get<RoleItem[]>('/roles'),
      ]);
      setItems(usersRes.data);
      setTotal(usersRes.total);
      setPages(Math.max(1, usersRes.pages));
      setRoles(rolesRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(user: UserItem) {
    setError(null);
    setSuccess(null);
    setEditingUser(user);
    setEditForm({
      dni: user.dni,
      fullName: user.fullName,
      birthDate: calendarDateKeyFromStored(user.birthDate),
      isActive: user.isActive,
    });
  }

  async function openAssignBranches(user: UserItem) {
    setLoadingAssign(true);
    setError(null);
    setSuccess(null);
    try {
      const [branches, excluded] = await Promise.all([
        api.get<QuoteBranchItem[]>('/quote-branches?includeInactive=true'),
        api.get<{ branchIds: string[] }>(`/users/${user.id}/excluded-branches`),
      ]);
      setAssignBranchesModal({
        user,
        branches,
        excludedBranchIds: excluded.branchIds ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las sucursales');
    } finally {
      setLoadingAssign(false);
    }
  }

  async function openAssignBuildings(user: UserItem) {
    setLoadingAssign(true);
    setError(null);
    setSuccess(null);
    try {
      invalidateBuildingsListCache();
      const [buildingRoles, buildings, excludedBranches] = await Promise.all([
        api.get<UserBuildingRoleItem[]>(`/users/${user.id}/building-roles`),
        fetchBuildingsList(),
        api.get<{ branchIds: string[] }>(`/users/${user.id}/excluded-branches`),
      ]);
      const excludedBranchIds = new Set(excludedBranches.branchIds ?? []);
      const visibleBuildings =
        excludedBranchIds.size === 0
          ? buildings
          : buildings.filter(
              (building) => !building.branchId || !excludedBranchIds.has(building.branchId),
            );
      setAssignBuildingsModal({
        user,
        buildings: visibleBuildings,
        buildingRoles,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las asignaciones');
    } finally {
      setLoadingAssign(false);
    }
  }

  function closeEdit() {
    setEditingUser(null);
    setEditForm(EMPTY_EDIT);
  }

  function closeAssignBuildings() {
    setAssignBuildingsModal(null);
  }

  function closeAssignBranches() {
    setAssignBranchesModal(null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setSavingEdit(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/users/${editingUser.id}`, {
        dni: editForm.dni,
        fullName: editForm.fullName,
        birthDate: editForm.birthDate || null,
        isActive: editForm.isActive,
      });

      const birthChanged =
        calendarDateKeyFromStored(editingUser.birthDate) !== (editForm.birthDate || '');
      setSuccess(
        birthChanged
          ? 'Usuario actualizado. La contraseña ahora es la fecha de nacimiento (DDMMYYYY).'
          : 'Usuario actualizado.',
      );
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario');
    } finally {
      setSavingEdit(false);
    }
  }

  function handleUserCreated() {
    setSuccess(
      'Usuario creado. La contraseña inicial es la fecha de nacimiento (DDMMYYYY) o 01012000.',
    );
    void load();
  }

  function handleBuildingsSaved() {
    invalidateBuildingsListCache();
    setSuccess('Edificios actualizados. Solo se asignaron edificios de sucursales permitidas.');
    void load();
  }

  function handleBranchesSaved() {
    setSuccess('Sucursales actualizadas. El usuario verá todas salvo las excluidas.');
    void load();
  }

  async function handleDelete(user: UserItem) {
    if (
      !window.confirm(
        `¿Eliminar el usuario "${user.fullName}"?\n\nSi no tiene datos asociados se elimina directamente.`,
      )
    ) {
      return;
    }

    setDeletingId(user.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/users/${user.id}`);
      setSuccess(`Usuario "${user.fullName}" eliminado.`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo eliminar el usuario';
      const canCascade = msg.includes('No se puede eliminar el usuario');
      if (canCascade) {
        const confirmCascade = window.confirm(
          `${msg}\n\n¿Querés borrar también todo lo asociado (roles, dispositivos, fichajes, asignaciones, etc.)?\n\nEsta acción no se puede deshacer.`,
        );
        if (confirmCascade) {
          try {
            await api.delete(`/users/${user.id}?cascade=true`);
            setSuccess(
              `Usuario "${user.fullName}" y todos sus datos asociados fueron eliminados.`,
            );
            await load();
            return;
          } catch (cascadeErr) {
            setError(
              cascadeErr instanceof Error
                ? cascadeErr.message
                : 'No se pudo eliminar el usuario en cascada',
            );
            return;
          }
        }
      }
      setError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/configuracion" className="back-link">
            ← Configuración
          </Link>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">Gestioná altas, sucursales y asignación por edificio.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          Crear usuario
        </button>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <h2 className="card-title">Listado de usuarios</h2>
        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando usuarios…</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>DNI</th>
                  <th>Nombre</th>
                  <th>Nacimiento</th>
                  <th>Rol principal</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <tr key={user.id}>
                    <td>{user.dni}</td>
                    <td>{user.fullName}</td>
                    <td>{formatBirthDate(user.birthDate)}</td>
                    <td>{ROLE_LABELS[user.primaryRole] ?? user.primaryRole}</td>
                    <td>
                      <span className={`badge ${user.isActive ? 'badge-success' : ''}`}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="table-row-actions table-row-actions-stack">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(user)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void openAssignBranches(user)}
                          disabled={loadingAssign}
                        >
                          Gestionar sucursales
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void openAssignBuildings(user)}
                          disabled={loadingAssign}
                        >
                          Gestionar edificios
                        </button>
                        {user.isActive ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={deletingId === user.id}
                            onClick={() => void handleDelete(user)}
                          >
                            {deletingId === user.id ? 'Eliminando…' : 'Eliminar'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length > 0 ? (
          <div className="pagination">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span className="pagination-info">
              Página {page} de {pages} · {total} usuario{total === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Siguiente
            </button>
          </div>
        ) : null}
      </div>

      {createOpen ? (
        <CreateUserModal
          roles={roles}
          onClose={() => setCreateOpen(false)}
          onCreated={handleUserCreated}
        />
      ) : null}

      {assignBranchesModal ? (
        <AssignBranchesModal
          userId={assignBranchesModal.user.id}
          userFullName={assignBranchesModal.user.fullName}
          userDni={assignBranchesModal.user.dni}
          branches={assignBranchesModal.branches}
          excludedBranchIds={assignBranchesModal.excludedBranchIds}
          onClose={closeAssignBranches}
          onSaved={handleBranchesSaved}
        />
      ) : null}

      {assignBuildingsModal ? (
        <AssignBuildingsModal
          userId={assignBuildingsModal.user.id}
          userFullName={assignBuildingsModal.user.fullName}
          userDni={assignBuildingsModal.user.dni}
          primaryRole={assignBuildingsModal.user.primaryRole}
          roles={roles}
          buildings={assignBuildingsModal.buildings}
          buildingRoles={assignBuildingsModal.buildingRoles}
          onClose={closeAssignBuildings}
          onSaved={handleBuildingsSaved}
        />
      ) : null}

      {editingUser ? (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Editar usuario</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeEdit}>
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="stack">
              <div className="grid-2">
                <div className="form-field">
                  <label>DNI *</label>
                  <input
                    value={editForm.dni}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, dni: e.target.value.replace(/\D/g, '') }))
                    }
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Nombre completo *</label>
                  <input
                    value={editForm.fullName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Fecha de nacimiento</label>
                  <input
                    type="date"
                    value={editForm.birthDate}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                  />
                </div>
              </div>

              <label>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />{' '}
                Usuario activo
              </label>

              <p className="muted">
                Para asignar sucursales o edificios usá los botones del listado. Si cambiás la fecha
                de nacimiento, la contraseña pasa a ser esa fecha (DDMMYYYY). Sin fecha, es
                01012000.
              </p>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeEdit}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
