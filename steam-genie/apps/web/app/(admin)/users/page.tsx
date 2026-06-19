'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import {
  BuildingCheckboxGrid,
  buildInitialRoles,
  formatUserBuildings,
  getBuildingIdsForRole,
} from '../../../components/BuildingCheckboxGrid';
import { ROLE_LABELS } from '../../../lib/labels';
import type { Paginated, RoleItem, UserDetail, UserItem } from '../../../lib/types';

interface EditFormState {
  dni: string;
  fullName: string;
  birthDate: string;
  roleId: string;
  buildingIds: string[];
  isActive: boolean;
}

const EMPTY_EDIT: EditFormState = {
  dni: '',
  fullName: '',
  birthDate: '',
  roleId: '',
  buildingIds: [],
  isActive: true,
};

const ROLE_HIERARCHY = ['admin', 'manager', 'cleaner', 'client', 'provider'];

function toDateInputValue(iso?: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function pickPrimaryRoleId(user: UserDetail, roles: RoleItem[]): string {
  const assignments = user.buildingRoles ?? [];
  if (assignments.length === 0) {
    return roles.find((r) => r.name === user.primaryRole)?.id ?? '';
  }

  const sorted = [...assignments].sort((a, b) => {
    const ai = ROLE_HIERARCHY.indexOf(a.role.name);
    const bi = ROLE_HIERARCHY.indexOf(b.role.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return sorted[0]?.role.id ?? '';
}

export default function UsersPage() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [userDetails, setUserDetails] = useState<Record<string, UserDetail>>({});
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDetail | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT);

  const [dni, setDni] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [roleId, setRoleId] = useState('');
  const [createBuildingIds, setCreateBuildingIds] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes, buildingsRes] = await Promise.all([
        api.get<Paginated<UserItem>>('/users?limit=100'),
        api.get<RoleItem[]>('/roles'),
        api.get<{ data: Array<{ id: string; name: string }> }>('/buildings?limit=100'),
      ]);
      setItems(usersRes.data);
      setRoles(rolesRes);
      setBuildings(buildingsRes.data);
      const defaultRole =
        rolesRes.find((role) => role.name === 'cleaner') ?? rolesRes[0];
      if (!roleId && defaultRole) setRoleId(defaultRole.id);

      const details = await Promise.all(
        usersRes.data.map((user) => api.get<UserDetail>(`/users/${user.id}`)),
      );
      setUserDetails(Object.fromEntries(details.map((detail) => [detail.id, detail])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openEdit(userId: string) {
    setLoadingEdit(true);
    setError(null);
    setSuccess(null);
    try {
      const detail = userDetails[userId] ?? (await api.get<UserDetail>(`/users/${userId}`));
      const primaryRoleId = pickPrimaryRoleId(detail, roles);

      setEditingUser(detail);
      setEditForm({
        dni: detail.dni,
        fullName: detail.fullName,
        birthDate: toDateInputValue(detail.birthDate),
        roleId: primaryRoleId,
        buildingIds: getBuildingIdsForRole(detail.buildingRoles ?? [], primaryRoleId),
        isActive: detail.isActive,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el usuario');
    } finally {
      setLoadingEdit(false);
    }
  }

  function closeEdit() {
    setEditingUser(null);
    setEditForm(EMPTY_EDIT);
  }

  function handleEditRoleChange(nextRoleId: string) {
    if (!editingUser) {
      setEditForm((prev) => ({ ...prev, roleId: nextRoleId, buildingIds: [] }));
      return;
    }
    setEditForm((prev) => ({
      ...prev,
      roleId: nextRoleId,
      buildingIds: getBuildingIdsForRole(editingUser.buildingRoles ?? [], nextRoleId),
    }));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/users', {
        dni,
        fullName,
        birthDate: birthDate ? `${birthDate}T00:00:00.000Z` : undefined,
        isActive: true,
        initialRoles: buildInitialRoles(roleId, createBuildingIds),
      });
      setDni('');
      setFullName('');
      setBirthDate('');
      setCreateBuildingIds([]);
      setSuccess('Usuario creado. La contraseña inicial es la fecha de nacimiento (DDMMYYYY) o 01012000.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario');
    } finally {
      setCreating(false);
    }
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
        birthDate: editForm.birthDate ? `${editForm.birthDate}T00:00:00.000Z` : null,
        isActive: editForm.isActive,
      });

      if (editForm.roleId) {
        await api.put(`/users/${editingUser.id}/building-roles/bulk`, {
          roleId: editForm.roleId,
          buildingIds: editForm.buildingIds,
        });
      }

      setSuccess('Usuario actualizado.');
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">Gestioná altas, roles y asignación por edificio.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <h2 className="card-title">Nuevo usuario</h2>
        <form onSubmit={handleCreate} className="stack">
          <div className="grid-2">
            <div className="form-field">
              <label>DNI *</label>
              <input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))} required />
            </div>
            <div className="form-field">
              <label>Nombre completo *</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>Fecha de nacimiento</label>
              <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Rol</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {ROLE_LABELS[role.name] ?? role.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Edificios asignados</label>
            <p className="muted">
              Marcá uno o varios edificios. Si no marcás ninguno, el rol queda global (sin edificio).
            </p>
            <BuildingCheckboxGrid
              buildings={buildings}
              selectedIds={createBuildingIds}
              onChange={setCreateBuildingIds}
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Listado</h2>
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
                <th>Edificios</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>{user.dni}</td>
                  <td>{user.fullName}</td>
                  <td>{user.birthDate ? toDateInputValue(user.birthDate) : '—'}</td>
                  <td>{ROLE_LABELS[user.primaryRole] ?? user.primaryRole}</td>
                  <td>{formatUserBuildings(userDetails[user.id]?.buildingRoles ?? [])}</td>
                  <td>
                    <span className={`badge ${user.isActive ? 'badge-success' : ''}`}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void openEdit(user.id)}
                      disabled={loadingEdit}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

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
                <div className="form-field">
                  <label>Rol</label>
                  <select
                    value={editForm.roleId}
                    onChange={(e) => handleEditRoleChange(e.target.value)}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {ROLE_LABELS[role.name] ?? role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label>Edificios asignados</label>
                <p className="muted">
                  Seleccioná todos los edificios donde este usuario tendrá el rol elegido.
                </p>
                <BuildingCheckboxGrid
                  buildings={buildings}
                  selectedIds={editForm.buildingIds}
                  onChange={(buildingIds) => setEditForm((prev) => ({ ...prev, buildingIds }))}
                />
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
                La contraseña no se modifica automáticamente al editar la fecha de nacimiento.
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
