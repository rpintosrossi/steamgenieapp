'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { StockSubnav } from '../../../../components/StockSubnav';
import { api } from '../../../../lib/api-client';
import type { StockSupplierItem } from '../../../../lib/types';

export default function StockSuppliersPage() {
  const [items, setItems] = useState<StockSupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        includeInactive: showInactive ? 'true' : 'false',
      });
      const data = await api.get<StockSupplierItem[]>(`/stock/suppliers?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar proveedores');
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
      await api.post('/stock/suppliers', {
        name,
        contactEmail: newEmail.trim() || undefined,
        contactPhone: newPhone.trim() || undefined,
      });
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setSuccess('Proveedor creado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el proveedor');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: StockSupplierItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditEmail(item.contactEmail ?? '');
    setEditPhone(item.contactPhone ?? '');
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditEmail('');
    setEditPhone('');
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) return;

    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/stock/suppliers/${id}`, {
        name,
        contactEmail: editEmail.trim() || null,
        contactPhone: editPhone.trim() || null,
      });
      cancelEdit();
      setSuccess('Proveedor actualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el proveedor');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(item: StockSupplierItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/stock/suppliers/${item.id}`, { isActive: !item.isActive });
      setSuccess(item.isActive ? 'Proveedor desactivado.' : 'Proveedor activado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el proveedor');
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(item: StockSupplierItem) {
    if (!window.confirm(`¿Eliminar el proveedor "${item.name}"?`)) return;

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/stock/suppliers/${item.id}`);
      setSuccess('Proveedor eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el proveedor');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Proveedores</h1>
          <p className="page-subtitle">Gestioná los proveedores de insumos del inventario.</p>
        </div>
      </div>

      <StockSubnav />

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleCreate} className="stock-inline-form">
          <div className="form-field" style={{ flex: 2, margin: 0 }}>
            <label htmlFor="sup-name">Nuevo proveedor</label>
            <input
              id="sup-name"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del proveedor"
              maxLength={200}
              required
            />
          </div>
          <div className="form-field" style={{ flex: 1, margin: 0 }}>
            <label htmlFor="sup-email">Email</label>
            <input
              id="sup-email"
              className="input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="form-field" style={{ flex: 1, margin: 0 }}>
            <label htmlFor="sup-phone">Teléfono</label>
            <input
              id="sup-phone"
              className="input"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              maxLength={50}
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
          <p className="empty-state">No hay proveedores.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>Productos</th>
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
                            maxLength={200}
                          />
                        ) : (
                          item.name
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            className="input"
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                          />
                        ) : (
                          item.contactEmail ?? '—'
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            className="input"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                          />
                        ) : (
                          item.contactPhone ?? '—'
                        )}
                      </td>
                      <td>{item._count?.products ?? 0}</td>
                      <td>
                        <span className={item.isActive ? 'badge badge-success' : 'badge badge-warning'}>
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
