'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { QuotesSubnav } from '../../../../components/QuotesSubnav';
import { api } from '../../../../lib/api-client';
import type { QuoteBranchItem } from '../../../../lib/types';

type Draft = {
  name: string;
  address: string;
  phone: string;
};

const EMPTY_DRAFT: Draft = { name: '', address: '', phone: '' };

export default function QuoteBranchesPage() {
  const [items, setItems] = useState<QuoteBranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        includeInactive: showInactive ? 'true' : 'false',
      });
      const data = await api.get<QuoteBranchItem[]>(`/quote-branches?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar sucursales');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = draft.name.trim();
    const address = draft.address.trim();
    const phone = draft.phone.trim();
    if (!name || !address || !phone) return;

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/quote-branches', { name, address, phone });
      setDraft(EMPTY_DRAFT);
      setSuccess('Sucursal creada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sucursal');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: QuoteBranchItem) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, address: item.address, phone: item.phone });
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  }

  async function saveEdit(id: string) {
    const name = editDraft.name.trim();
    const address = editDraft.address.trim();
    const phone = editDraft.phone.trim();
    if (!name || !address || !phone) return;

    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/quote-branches/${id}`, { name, address, phone });
      cancelEdit();
      setSuccess('Sucursal actualizada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSavingId(null);
    }
  }

  async function setDefault(item: QuoteBranchItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/quote-branches/${item.id}`, { isDefault: true });
      setSuccess(`“${item.name}” es ahora la sucursal predeterminada.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(item: QuoteBranchItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/quote-branches/${item.id}`, { isActive: !item.isActive });
      setSuccess(item.isActive ? 'Sucursal desactivada.' : 'Sucursal activada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(item: QuoteBranchItem) {
    if (!window.confirm(`¿Eliminar la sucursal “${item.name}”?`)) return;

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/quote-branches/${item.id}`);
      setSuccess('Sucursal eliminada.');
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
          <Link href="/configuracion" className="back-link">
            ← Volver a configuración
          </Link>
          <h1 className="page-title">Sucursales</h1>
          <p className="page-subtitle">
            Dirección y teléfono que aparecen en el presupuesto. Por defecto se usa Buenos Aires.
          </p>
        </div>
      </div>

      <QuotesSubnav />

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleCreate} className="stock-inline-form">
          <div className="form-field" style={{ flex: 1.2, margin: 0 }}>
            <label htmlFor="qb-name">Nueva sucursal</label>
            <input
              id="qb-name"
              className="input"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ej. Córdoba"
              maxLength={200}
              required
            />
          </div>
          <div className="form-field" style={{ flex: 2, margin: 0 }}>
            <label htmlFor="qb-address">Dirección</label>
            <input
              id="qb-address"
              className="input"
              value={draft.address}
              onChange={(e) => setDraft((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Calle y localidad"
              maxLength={300}
              required
            />
          </div>
          <div className="form-field" style={{ flex: 1, margin: 0 }}>
            <label htmlFor="qb-phone">Teléfono</label>
            <input
              id="qb-phone"
              className="input"
              value={draft.phone}
              onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Ej. 351-1234567"
              maxLength={50}
              required
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
          <p className="empty-state">No hay sucursales.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Dirección</th>
                  <th>Teléfono</th>
                  <th>Presupuestos</th>
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
                            value={editDraft.name}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, name: e.target.value }))
                            }
                            maxLength={200}
                          />
                        ) : (
                          <>
                            {item.name}
                            {item.isDefault ? (
                              <span className="badge badge-success" style={{ marginLeft: 8 }}>
                                Predeterminada
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            className="input"
                            value={editDraft.address}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, address: e.target.value }))
                            }
                            maxLength={300}
                          />
                        ) : (
                          item.address
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            className="input"
                            value={editDraft.phone}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            maxLength={50}
                          />
                        ) : (
                          item.phone
                        )}
                      </td>
                      <td>{item._count?.quotes ?? 0}</td>
                      <td>
                        <span className={`badge ${item.isActive ? 'badge-success' : ''}`}>
                          {item.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
                              {!item.isDefault && item.isActive ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy}
                                  onClick={() => void setDefault(item)}
                                >
                                  Predeterminada
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy || item.isDefault}
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
