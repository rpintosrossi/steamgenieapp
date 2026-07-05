'use client';

import { FormEvent, useState } from 'react';
import { TASK_FREQUENCIES } from '@steam-genie/shared-constants';
import { LocationPicker } from './LocationPicker';
import { TaskCustomFieldsDraftEditor } from './TaskCustomFieldsDraftEditor';
import { api } from '../lib/api-client';
import { TASK_FREQUENCY_LABELS } from '../lib/labels';
import {
  persistTaskCustomFields,
  validateCustomFieldDraft,
  type TaskCustomFieldDraft,
} from '../lib/task-custom-fields';

type CreateTaskModalProps = {
  buildings: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
};

type CreatedTask = {
  id: string;
};

export function CreateTaskModal({ buildings, onClose, onCreated }: CreateTaskModalProps) {
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
  const [customFields, setCustomFields] = useState<TaskCustomFieldDraft[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTask() {
    if (!location.buildingId || !location.zoneId) {
      setError('Seleccioná edificio y zona.');
      return;
    }

    for (const field of customFields) {
      const validationError = validateCustomFieldDraft(field);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setCreating(true);
    setError(null);

    try {
      const created = await api.post<CreatedTask>('/tasks', {
        buildingId: location.buildingId,
        zoneId: location.zoneId,
        subzoneId: location.subzoneId || undefined,
        name: name.trim(),
        frequency,
        requiresPhoto,
        allowsObservation,
        requiresRejectionReason,
        isActive: true,
      });

      if (customFields.length > 0) {
        await persistTaskCustomFields(created.id, customFields);
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea');
    } finally {
      setCreating(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void createTask();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Nueva tarea</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Las tareas <strong>Eventual (checkout)</strong> se usan al crear reservas. Las demás son
          periódicas.
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="stack">
          <form onSubmit={handleSubmit} className="stack">
            <LocationPicker value={location} onChange={setLocation} buildings={buildings} />

            <div className="grid-2">
              <div className="form-field">
                <label>Nombre *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label>Frecuencia *</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  {Object.values(TASK_FREQUENCIES).map((f) => (
                    <option key={f} value={f}>
                      {TASK_FREQUENCY_LABELS[f] ?? f}
                    </option>
                  ))}
                </select>
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
          </form>

          <TaskCustomFieldsDraftEditor fields={customFields} onChange={setCustomFields} />

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating}
              onClick={() => void createTask()}
            >
              {creating ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
