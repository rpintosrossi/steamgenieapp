'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { TasksSubnav } from '../../../../components/TasksSubnav';
import { api } from '../../../../lib/api-client';
import type { TaskCategoryItem } from '../../../../lib/types';

export default function TaskCategoriesPage() {
  const [items, setItems] = useState<TaskCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSort, setNewSort] = useState('0');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSort, setEditSort] = useState('0');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        includeInactive: showInactive ? 'true' : 'false',
      });
      const data = await api.get<TaskCategoryItem[]>(`/tasks/categories?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/tasks/categories', {
        name,
        sortOrder: Number(newSort) || 0,
      });
      setNewName('');
      setNewSort('0');
      setSuccess('Categoría creada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: TaskCategoryItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditSort(String(item.sortOrder));
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditSort('0');
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) return;

    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/tasks/categories/${id}`, {
        name,
        sortOrder: Number(editSort) || 0,
      });
      cancelEdit();
      setSuccess('Categoría actualizada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la categoría');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(item: TaskCategoryItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/tasks/categories/${item.id}`, { isActive: !item.isActive });
      setSuccess(item.isActive ? 'Categoría desactivada.' : 'Categoría activada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la categoría');
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(item: TaskCategoryItem) {
    if (!window.confirm(`¿Eliminar la categoría "${item.name}"?`)) return;

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/tasks/categories/${item.id}`);
      setSuccess('Categoría eliminada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la categoría');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Categorías de tareas</h1>
          <p className="page-subtitle">
            Agrupá tareas eventuales por categoría para armar servicios con un conjunto reducido.
          </p>
        </div>
      </div>

      <TasksSubnav />

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleCreate} className="stock-inline-form">
          <div className="form-field" style={{ flex: 2, margin: 0 }}>
            <label htmlFor="task-cat-name">Nueva categoría</label>
            <input
              id="task-cat-name"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej. Limpieza profunda"
              maxLength={100}
              required
            />
          </div>
          <div className="form-field" style={{ width: 120, margin: 0 }}>
            <label htmlFor="task-cat-sort">Orden</label>
            <input
              id="task-cat-sort"
              className="input"
              type="number"
              min={0}
              value={newSort}
              onChange={(e) => setNewSort(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={creating} style={{ alignSelf: 'flex-end' }}>
            {creating ? 'Creando…' : 'Agregar'}
          </button>
        </form>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inactivas
        </label>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
          </div>
        ) : items.length === 0 ? (
          <p className="empty-state">No hay categorías.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Orden</th>
                  <th>Tareas</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const editing = editingId === item.id;
                  const busy = savingId === item.id;
                  return (
                    <tr key={item.id} className={!item.isActive ? 'row-muted' : undefined}>
                      <td>
                        {editing ? (
                          <input
                            className="input"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={100}
                          />
                        ) : (
                          item.name
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={editSort}
                            onChange={(e) => setEditSort(e.target.value)}
                            style={{ width: 80 }}
                          />
                        ) : (
                          item.sortOrder
                        )}
                      </td>
                      <td>{item._count?.tasks ?? 0}</td>
                      <td>
                        <span className={item.isActive ? 'badge badge-success' : 'badge badge-warning'}>
                          {item.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busy}
                                onClick={() => void saveEdit(item.id)}
                              >
                                Guardar
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => startEdit(item)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => void toggleActive(item)}
                              >
                                {item.isActive ? 'Desactivar' : 'Activar'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => void removeItem(item)}
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
