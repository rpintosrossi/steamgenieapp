'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  calendarDateKeyFromStored,
  formatStoredCalendarDate,
} from '@steam-genie/shared-constants';
import { api } from '../../../lib/api-client';
import { fetchBuildingsList } from '../../../lib/buildings-cache';
import { AssignBuildingsModal } from '../../../components/AssignBuildingsModal';
import { CreateUserModal } from '../../../components/CreateUserModal';
import { ROLE_LABELS } from '../../../lib/labels';
import type { Paginated, RoleItem, UserBuildingRoleItem, UserItem } from '../../../lib/types';

interface EditFormState {
  dni: string;
  fullName: string;
  birthDate: string;
  isActive: boolean;
}

interface AssignModalState {
  user: UserItem;
  buildings: Array<{ id: string; name: string }>;
  buildingRoles: UserBuildingRoleItem[];
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
  const [assignModal, setAssignModal] = useState<AssignModalState | null>(null);
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

  async function openAssign(user: UserItem) {
    setLoadingAssign(true);
    setError(null);
    setSuccess(null);
    try {
      const [buildingRoles, buildings] = await Promise.all([
        api.get<UserBuildingRoleItem[]>(`/users/${user.id}/building-roles`),
        fetchBuildingsList(),
      ]);
      setAssignModal({ user, buildings, buildingRoles });
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

  function closeAssign() {
    setAssignModal(null);
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

      setSuccess('Usuario actualizado.');
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

  function handleAssignmentsSaved() {
    setSuccess('Edificios asignados correctamente.');
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
          <p className="page-subtitle">Gestioná altas, roles y asignación por edificio.</p>
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
                          onClick={() => void openAssign(user)}
                          disabled={loadingAssign}
                        >
                          Gestionar Edificios
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

      {assignModal ? (
        <AssignBuildingsModal
          userId={assignModal.user.id}
          userFullName={assignModal.user.fullName}
          userDni={assignModal.user.dni}
          primaryRole={assignModal.user.primaryRole}
          roles={roles}
          buildings={assignModal.buildings}
          buildingRoles={assignModal.buildingRoles}
          onClose={closeAssign}
          onSaved={handleAssignmentsSaved}
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
                Para asignar edificios usá el botón &quot;Gestionar Edificios&quot; en el listado. La
                contraseña no se modifica automáticamente al editar la fecha de nacimiento.
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
