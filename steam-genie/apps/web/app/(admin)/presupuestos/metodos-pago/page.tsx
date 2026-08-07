'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { QuotesSubnav } from '../../../../components/QuotesSubnav';
import { api } from '../../../../lib/api-client';
import type { PaymentMethodItem } from '../../../../lib/types';

export default function PaymentMethodsPage() {
  const [items, setItems] = useState<PaymentMethodItem[]>([]);
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
      const data = await api.get<PaymentMethodItem[]>(`/payment-methods?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar métodos de pago');
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
      await api.post('/payment-methods', {
        name,
        sortOrder: Number(newSort) || 0,
      });
      setNewName('');
      setNewSort('0');
      setSuccess('Método de pago creado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el método de pago');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: PaymentMethodItem) {
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
      await api.patch(`/payment-methods/${id}`, {
        name,
        sortOrder: Number(editSort) || 0,
      });
      cancelEdit();
      setSuccess('Método de pago actualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(item: PaymentMethodItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/payment-methods/${item.id}`, { isActive: !item.isActive });
      setSuccess(item.isActive ? 'Método desactivado.' : 'Método activado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(item: PaymentMethodItem) {
    if (!window.confirm(`¿Eliminar el método "${item.name}"?`)) return;

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/payment-methods/${item.id}`);
      setSuccess('Método eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Métodos de pago</h1>
          <p className="page-subtitle">
            Catálogo de medios para registrar anticipos o pagos pendientes en presupuestos.
          </p>
        </div>
      </div>

      <QuotesSubnav />

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleCreate} className="stock-inline-form">
          <div className="form-field" style={{ flex: 2, margin: 0 }}>
            <label htmlFor="pm-name">Nuevo método</label>
            <input
              id="pm-name"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej. Transferencia"
              maxLength={100}
              required
            />
          </div>
          <div className="form-field" style={{ width: 120, margin: 0 }}>
            <label htmlFor="pm-sort">Orden</label>
            <input
              id="pm-sort"
              className="input"
              type="number"
              min={0}
              value={newSort}
              onChange={(e) => setNewSort(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating}
            style={{ alignSelf: 'flex-end' }}
          >
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
          <p className="empty-state">No hay métodos de pago.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Orden</th>
                  <th>Usos</th>
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
                      <td style={{ width: 100 }}>
                        {editing ? (
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={editSort}
                            onChange={(e) => setEditSort(e.target.value)}
                          />
                        ) : (
                          item.sortOrder
                        )}
                      </td>
                      <td>{item._count?.quotePayments ?? 0}</td>
                      <td>
                        <span className={`badge ${item.isActive ? 'badge-success' : ''}`}>
                          {item.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
                                disabled={busy}
                                onClick={cancelEdit}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
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
