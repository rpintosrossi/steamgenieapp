'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { WORK_ORDER_STATUS_LABELS } from '../lib/labels';
import type { WorkOrderDetail } from '../lib/types';

type PhotoMode = 'none' | 'optional' | 'required';

type ChecklistRow = {
  key: string;
  id?: string;
  name: string;
  photoMode: PhotoMode;
  hasExecution: boolean;
};

type Props = {
  workOrderId: string;
  onClose: () => void;
  onSaved?: () => void;
};

function photoModeFromSnapshots(
  requiresPhoto: boolean,
  allowsPhoto?: boolean,
): PhotoMode {
  if (requiresPhoto) return 'required';
  if (allowsPhoto) return 'optional';
  return 'none';
}

let newRowSeq = 0;

function emptyRow(): ChecklistRow {
  newRowSeq += 1;
  return {
    key: `new-${newRowSeq}`,
    name: '',
    photoMode: 'none',
    hasExecution: false,
  };
}

export function WorkOrderChecklistModal({ workOrderId, onClose, onSaved }: Props) {
  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.get<WorkOrderDetail>(`/work-orders/${workOrderId}`);
      setWo(detail);
      const tasks = [...(detail.workOrderTasks ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      setRows(
        tasks.length > 0
          ? tasks.map((task) => ({
              key: task.id,
              id: task.id,
              name: task.nameSnapshot,
              photoMode: photoModeFromSnapshots(
                task.requiresPhotoSnapshot,
                task.allowsPhotoSnapshot,
              ),
              hasExecution: (task._count?.taskExecutions ?? 0) > 0,
            }))
          : [emptyRow()],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el checklist');
      setWo(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isCompleted = wo?.status === 'COMPLETED';

  function updateRow(key: string, patch: Partial<ChecklistRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!wo || isCompleted) return;

    const cleaned = rows
      .map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        name: row.name.trim().slice(0, 5000),
        allowsPhoto: row.photoMode !== 'none',
        requiresPhoto: row.photoMode === 'required',
      }))
      .filter((task) => task.name.length > 0);

    if (cleaned.length === 0) {
      setError('Agregá al menos una tarea con nombre.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.patch(`/work-orders/${workOrderId}/checklist`, { tasks: cleaned });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el checklist');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Editar tareas</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {wo ? (
          <p className="muted" style={{ marginTop: 0 }}>
            <strong>{wo.title}</strong>
            <br />
            {wo.building?.name ?? 'Edificio'}
            {wo.zone?.name ? ` · ${wo.zone.name}` : ''}
            {' · '}
            {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
          </p>
        ) : null}

        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="muted">Cargando tareas…</p>
        ) : isCompleted ? (
          <div className="alert alert-warning">
            Este servicio ya está completado. El checklist no se puede modificar.
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Podés corregir el nombre o exigir fotos aunque el servicio ya esté creado. Las
              tareas con ejecución registrada no se pueden quitar.
            </p>

            <div className="stack" style={{ gap: 8 }}>
              {rows.map((row, index) => (
                <div
                  key={row.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <input
                    className="input"
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    placeholder={`Tarea ${index + 1}`}
                    required
                  />
                  <select
                    className="input"
                    value={row.photoMode}
                    onChange={(e) =>
                      updateRow(row.key, { photoMode: e.target.value as PhotoMode })
                    }
                    style={{ width: 'auto' }}
                    aria-label="Modo de foto"
                  >
                    <option value="none">Sin foto</option>
                    <option value="optional">Foto opcional</option>
                    <option value="required">Foto obligatoria</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={row.hasExecution || rows.length <= 1}
                    title={
                      row.hasExecution
                        ? 'No se puede quitar una tarea que ya tiene ejecución'
                        : 'Quitar tarea'
                    }
                    onClick={() =>
                      setRows((prev) =>
                        prev.length <= 1 ? prev : prev.filter((item) => item.key !== row.key),
                      )
                    }
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
            >
              + Agregar tarea
            </button>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !rows.some((row) => row.name.trim().length > 0)}
              >
                {saving ? 'Guardando…' : 'Guardar tareas'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
