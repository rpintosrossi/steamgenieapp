'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { TasksSubnav } from '../../../../components/TasksSubnav';
import { api } from '../../../../lib/api-client';
import type { RejectionReasonItem } from '../../../../lib/types';

export default function TaskRejectionReasonsPage() {
  const [items, setItems] = useState<RejectionReasonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [newAllowsFreeText, setNewAllowsFreeText] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editAllowsFreeText, setEditAllowsFreeText] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        type: 'TASK_NOT_DONE',
        includeInactive: showInactive ? 'true' : 'false',
      });
      const data = await api.get<RejectionReasonItem[]>(`/rejection-reasons?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar motivos');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/rejection-reasons', {
        type: 'TASK_NOT_DONE',
        text,
        allowsFreeText: newAllowsFreeText,
      });
      setNewText('');
      setNewAllowsFreeText(false);
      setSuccess('Motivo creado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el motivo');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: RejectionReasonItem) {
    setEditingId(item.id);
    setEditText(item.text);
    setEditAllowsFreeText(item.allowsFreeText);
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
    setEditAllowsFreeText(false);
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;

    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/rejection-reasons/${id}`, {
        text,
        allowsFreeText: editAllowsFreeText,
      });
      setEditingId(null);
      setEditText('');
      setEditAllowsFreeText(false);
      setSuccess('Motivo actualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el motivo');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(item: RejectionReasonItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/rejection-reasons/${item.id}`, { isActive: !item.isActive });
      setSuccess(item.isActive ? 'Motivo desactivado.' : 'Motivo activado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el motivo');
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(item: RejectionReasonItem) {
    if (!window.confirm(`¿Eliminar el motivo "${item.text}"?`)) return;

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/rejection-reasons/${item.id}`);
      setSuccess('Motivo eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el motivo');
    } finally {
      setSavingId(null);
    }
  }

  const activeCount = items.filter((item) => item.isActive).length;

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/configuracion" className="back-link">
            ← Configuración
          </Link>
          <h1 className="page-title">Tareas</h1>
          <p className="page-subtitle">
            Motivos que el limpiador elige al marcar una tarea como no realizada en la app.
          </p>
        </div>
      </div>

      <TasksSubnav />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Nuevo motivo</h2>
        <form className="inline-form" onSubmit={handleCreate}>
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="new-reason-text">Texto del motivo</label>
            <input
              id="new-reason-text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Ej: Falta de insumos o Otro"
              maxLength={300}
              required
            />
          </div>
          <label className="checkbox-inline" style={{ alignSelf: 'flex-end', marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={newAllowsFreeText}
              onChange={(e) => setNewAllowsFreeText(e.target.checked)}
            />
            Campo libre
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
            {creating ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
          Si marcás “Campo libre”, en la app el limpiador deberá escribir el detalle al elegir este
          motivo (útil para “Otro”).
        </p>
      </div>

      <div className="card">
        <div className="inline-form" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <p className="muted" style={{ margin: 0 }}>
            {activeCount} motivo{activeCount === 1 ? '' : 's'} activo{activeCount === 1 ? '' : 's'}
          </p>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Mostrar inactivos
          </label>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando motivos…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">
            No hay motivos configurados. Agregá al menos uno para las tareas que requieren motivo al
            no realizarse.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={!item.isActive ? 'row-muted' : undefined}>
                    <td>
                      {editingId === item.id ? (
                        <div className="stack" style={{ gap: 8 }}>
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            maxLength={300}
                            autoFocus
                          />
                          <label className="checkbox-inline">
                            <input
                              type="checkbox"
                              checked={editAllowsFreeText}
                              onChange={(e) => setEditAllowsFreeText(e.target.checked)}
                            />
                            Campo libre
                          </label>
                        </div>
                      ) : (
                        item.text
                      )}
                    </td>
                    <td>
                      {item.allowsFreeText ? (
                        <span className="badge badge-info">Campo libre</span>
                      ) : (
                        <span className="muted">Fijo</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${item.isActive ? 'badge-success' : 'badge-warning'}`}
                      >
                        {item.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        {editingId === item.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={savingId === item.id || !editText.trim()}
                              onClick={() => void saveEdit(item.id)}
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
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
                              disabled={savingId === item.id}
                              onClick={() => startEdit(item)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={savingId === item.id}
                              onClick={() => void toggleActive(item)}
                            >
                              {item.isActive ? 'Desactivar' : 'Activar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={savingId === item.id}
                              onClick={() => void removeItem(item)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
