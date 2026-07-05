'use client';

import { FormEvent, useEffect, useState } from 'react';
import { TASK_FREQUENCIES } from '@steam-genie/shared-constants';
import { LocationPicker } from './LocationPicker';
import { TaskCustomFieldsEditor, type TaskCustomField } from './TaskCustomFieldsEditor';
import { api } from '../lib/api-client';
import { TASK_FREQUENCY_LABELS } from '../lib/labels';
import type { TaskItem } from '../lib/types';

type TaskDetail = TaskItem & {
  customFields: TaskCustomField[];
};

type EditTaskModalProps = {
  taskId: string;
  buildings: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
};

export function EditTaskModal({ taskId, buildings, onClose, onSaved }: EditTaskModalProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [location, setLocation] = useState({
    buildingId: '',
    floorId: '',
    zoneId: '',
    subzoneId: '',
  });
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<string>(TASK_FREQUENCIES.EVENTUAL);
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [allowsObservation, setAllowsObservation] = useState(true);
  const [requiresRejectionReason, setRequiresRejectionReason] = useState(true);
  const [customFields, setCustomFields] = useState<TaskCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get<TaskDetail>(`/tasks/${taskId}`);
        if (cancelled) return;
        setTask(data);
        setName(data.name);
        setFrequency(data.frequency);
        setRequiresPhoto(data.requiresPhoto);
        setAllowsObservation(data.allowsObservation);
        setRequiresRejectionReason(data.requiresRejectionReason);
        setCustomFields(data.customFields ?? []);
        setLocation({
          buildingId: data.buildingId,
          floorId: data.zone?.floor?.id ?? '',
          zoneId: data.zoneId ?? '',
          subzoneId: data.subzoneId ?? '',
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la tarea');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!location.buildingId || !location.zoneId) {
      setError('Seleccioná edificio y zona.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.patch(`/tasks/${taskId}`, {
        name: name.trim(),
        zoneId: location.zoneId,
        subzoneId: location.subzoneId || null,
        requiresPhoto,
        allowsObservation,
        requiresRejectionReason,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la tarea');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Configurar tarea</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando tarea…</p>
          </div>
        ) : !task ? (
          <div className="alert alert-error">{error ?? 'Tarea no encontrada.'}</div>
        ) : (
          <>
            {error ? <div className="alert alert-error">{error}</div> : null}

            <form onSubmit={handleSubmit} className="stack">
              <LocationPicker value={location} onChange={setLocation} buildings={buildings} />

              <div className="grid-2">
                <div className="form-field">
                  <label>Nombre *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label>Frecuencia</label>
                  <select value={frequency} disabled>
                    <option value={frequency}>
                      {TASK_FREQUENCY_LABELS[frequency] ?? frequency}
                    </option>
                  </select>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    La frecuencia no se puede modificar después de crear la tarea.
                  </p>
                </div>
              </div>

              <div className="grid-3">
                <label>
                  <input
                    type="checkbox"
                    checked={requiresPhoto}
                    onChange={(e) => setRequiresPhoto(e.target.checked)}
                  />{' '}
                  Requiere foto
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={allowsObservation}
                    onChange={(e) => setAllowsObservation(e.target.checked)}
                  />{' '}
                  Permite observación
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={requiresRejectionReason}
                    onChange={(e) => setRequiresRejectionReason(e.target.checked)}
                  />{' '}
                  Motivo si no se hace
                </label>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar datos'}
                </button>
              </div>
            </form>

            <TaskCustomFieldsEditor
              taskId={taskId}
              fields={customFields}
              onChange={setCustomFields}
            />
          </>
        )}
      </div>
    </div>
  );
}
