'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { StockSubnav } from '../../../../components/StockSubnav';
import { api } from '../../../../lib/api-client';
import type { StockWarehouseItem } from '../../../../lib/types';

const TYPE_LABELS = {
  COMPANY: 'Propio',
  CLIENT: 'Cliente',
} as const;

export default function StockWarehousesPage() {
  const [items, setItems] = useState<StockWarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        includeInactive: showInactive ? 'true' : 'false',
      });
      const data = await api.get<StockWarehouseItem[]>(`/stock/warehouses?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar depósitos');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setNewName('');
    setNewNotes('');
    setCreateOpen(true);
    setError(null);
    setSuccess(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setNewName('');
    setNewNotes('');
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/stock/warehouses', {
        name,
        type: 'COMPANY',
        notes: newNotes.trim() || undefined,
      });
      closeCreate();
      setSuccess('Depósito creado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el depósito');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: StockWarehouseItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditNotes(item.notes ?? '');
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditNotes('');
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) return;

    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/stock/warehouses/${id}`, {
        name,
        notes: editNotes.trim() || null,
      });
      cancelEdit();
      setSuccess('Depósito actualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el depósito');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(item: StockWarehouseItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/stock/warehouses/${item.id}`, { isActive: !item.isActive });
      setSuccess(item.isActive ? 'Depósito desactivado.' : 'Depósito activado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el depósito');
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(item: StockWarehouseItem) {
    if (!window.confirm(`¿Eliminar el depósito "${item.name}"?`)) return;

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/stock/warehouses/${item.id}`);
      setSuccess('Depósito eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el depósito');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Depósitos</h1>
          <p className="page-subtitle">
            Administrá sucursales y depósitos. Entrá a cada uno para ver y ajustar su inventario.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Nuevo depósito
        </button>
      </div>

      <StockSubnav />

      <div style={{ marginBottom: 12 }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inactivos
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
          <div className="empty-state">
            <p>No hay depósitos.</p>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
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
                          <div style={{ display: 'grid', gap: 8 }}>
                            <input
                              className="input"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              maxLength={200}
                            />
                            <input
                              className="input"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              placeholder="Notas"
                              maxLength={1000}
                            />
                          </div>
                        ) : (
                          <>
                            <strong>{item.name}</strong>
                            {item.notes ? (
                              <div className="text-muted text-sm">{item.notes}</div>
                            ) : null}
                            {item.building ? (
                              <div className="text-muted text-sm">
                                Cliente: {item.building.name}
                              </div>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td>{TYPE_LABELS[item.type]}</td>
                      <td>
                        <span
                          className={item.isActive ? 'badge badge-success' : 'badge badge-warning'}
                        >
                          {item.isActive ? 'Activo' : 'Inactivo'}
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
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={cancelEdit}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <Link
                                href={`/stock/inventario/${item.id}`}
                                className="btn btn-primary btn-sm"
                              >
                                Ver inventario
                              </Link>
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

      {createOpen ? (
        <div className="modal-overlay" onClick={closeCreate} role="presentation">
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-warehouse-title"
          >
            <div className="modal-header">
              <h2 id="create-warehouse-title" className="modal-title">
                Nuevo depósito
              </h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeCreate}>
                Cerrar
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-field">
                <label htmlFor="wh-name">Nombre</label>
                <input
                  id="wh-name"
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Sucursal Córdoba"
                  maxLength={200}
                  required
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label htmlFor="wh-notes">Notas (opcional)</label>
                <input
                  id="wh-notes"
                  className="input"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ubicación, contacto…"
                  maxLength={1000}
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeCreate}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creando…' : 'Crear depósito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
