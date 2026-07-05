'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  APP_MODULE_GROUPS,
  APP_MODULE_LABELS,
  type AppModuleKey,
} from '@steam-genie/shared-constants';
import { api } from '../../../lib/api-client';
import { ROLE_LABELS } from '../../../lib/labels';
import type { RoleDetailItem } from '../../../lib/types';

interface RoleFormState {
  name: string;
  description: string;
  modules: AppModuleKey[];
}

const EMPTY_FORM: RoleFormState = {
  name: '',
  description: '',
  modules: [],
};

function ModuleChecklist({
  selected,
  onChange,
  disabled,
}: {
  selected: AppModuleKey[];
  onChange: (modules: AppModuleKey[]) => void;
  disabled?: boolean;
}) {
  function toggle(module: AppModuleKey) {
    if (disabled) return;
    onChange(
      selected.includes(module)
        ? selected.filter((item) => item !== module)
        : [...selected, module],
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {APP_MODULE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="muted" style={{ marginBottom: 8, fontWeight: 600 }}>
            {group.label}
          </p>
          <div className="stack" style={{ gap: 6 }}>
            {group.modules.map((module) => (
              <label key={module}>
                <input
                  type="checkbox"
                  checked={selected.includes(module)}
                  disabled={disabled}
                  onChange={() => toggle(module)}
                />{' '}
                {APP_MODULE_LABELS[module]}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RolesPage() {
  const [items, setItems] = useState<RoleDetailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState<RoleFormState>(EMPTY_FORM);
  const [editingRole, setEditingRole] = useState<RoleDetailItem | null>(null);
  const [editForm, setEditForm] = useState<RoleFormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<RoleDetailItem[]>('/roles');
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/roles', {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        modules: createForm.modules,
      });
      setCreateForm(EMPTY_FORM);
      setSuccess('Rol creado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el rol');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(role: RoleDetailItem) {
    setEditingRole(role);
    setEditForm({
      name: role.name,
      description: role.description ?? '',
      modules: role.modules as AppModuleKey[],
    });
    setError(null);
    setSuccess(null);
  }

  function closeEdit() {
    setEditingRole(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingRole) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/roles/${editingRole.id}`, {
        ...(editingRole.isSystem ? {} : { name: editForm.name.trim() }),
        description: editForm.description.trim() || null,
        modules: editForm.modules,
      });
      setSuccess('Rol actualizado.');
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el rol');
    } finally {
      setSaving(false);
    }
  }

  async function removeRole(role: RoleDetailItem) {
    if (role.isSystem) return;
    if (!window.confirm(`¿Eliminar el rol "${ROLE_LABELS[role.name] ?? role.name}"?`)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/roles/${role.id}`);
      setSuccess('Rol eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el rol');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/configuracion" className="back-link">
            ← Configuración
          </Link>
          <h1 className="page-title">Roles y permisos</h1>
          <p className="page-subtitle">
            Definí qué módulos del panel puede ver cada rol. Un administrador puede tener acceso
            parcial.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Nuevo rol</h2>
        <form className="stack" onSubmit={handleCreate}>
          <div className="grid-2">
            <div className="form-field">
              <label>Nombre interno *</label>
              <input
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                  }))
                }
                placeholder="admin_operaciones"
                required
              />
              <p className="muted">Minúsculas, números y guiones bajos.</p>
            </div>
            <div className="form-field">
              <label>Descripción</label>
              <input
                value={createForm.description}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Acceso a operaciones diarias"
              />
            </div>
          </div>

          <div>
            <p className="muted" style={{ marginBottom: 8 }}>
              Módulos habilitados
            </p>
            <ModuleChecklist
              selected={createForm.modules}
              onChange={(modules) => setCreateForm((prev) => ({ ...prev, modules }))}
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear rol'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Roles existentes</h2>
        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando roles…</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Descripción</th>
                  <th>Módulos</th>
                  <th>Usuarios</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((role) => (
                  <tr key={role.id}>
                    <td>
                      {ROLE_LABELS[role.name] ?? role.name}
                      {role.isSystem ? (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          Sistema
                        </span>
                      ) : null}
                    </td>
                    <td>{role.description ?? '—'}</td>
                    <td>{role.modules.length}</td>
                    <td>{role.userCount}</td>
                    <td>
                      <div className="table-row-actions table-row-actions-stack">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(role)}
                        >
                          Editar
                        </button>
                        {!role.isSystem ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void removeRole(role)}
                            disabled={saving}
                          >
                            Eliminar
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
      </div>

      {editingRole ? (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                Editar rol: {ROLE_LABELS[editingRole.name] ?? editingRole.name}
              </h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeEdit}>
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="stack">
              {!editingRole.isSystem ? (
                <div className="form-field">
                  <label>Nombre interno *</label>
                  <input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                      }))
                    }
                    required
                  />
                </div>
              ) : null}

              <div className="form-field">
                <label>Descripción</label>
                <input
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div>
                <p className="muted" style={{ marginBottom: 8 }}>
                  Módulos habilitados
                </p>
                <ModuleChecklist
                  selected={editForm.modules}
                  onChange={(modules) => setEditForm((prev) => ({ ...prev, modules }))}
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
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
