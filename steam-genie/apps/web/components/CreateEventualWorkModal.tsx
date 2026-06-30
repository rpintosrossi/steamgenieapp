'use client';

import { FormEvent, useState } from 'react';
import {
  defaultDatetimeLocal,
  LocationPicker,
  toIsoFromDatetimeLocal,
} from './LocationPicker';
import { api } from '../lib/api-client';
import type { CreateCheckoutCleaningResponse } from '../lib/types';

type CreateEventualWorkModalProps = {
  onClose: () => void;
  onCreated: (result: CreateCheckoutCleaningResponse) => void;
};

export function CreateEventualWorkModal({ onClose, onCreated }: CreateEventualWorkModalProps) {
  const [location, setLocation] = useState({
    buildingId: '',
    floorId: '',
    zoneId: '',
    subzoneId: '',
  });
  const [scheduledAt, setScheduledAt] = useState(defaultDatetimeLocal(0, 11));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!location.buildingId || !location.floorId || !location.zoneId) {
      setError('Seleccioná edificio, planta y zona.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const result = await api.post<CreateCheckoutCleaningResponse>(
        '/work-orders/checkout-cleaning',
        {
          buildingId: location.buildingId,
          floorId: location.floorId,
          zoneId: location.zoneId,
          scheduledAt: toIsoFromDatetimeLocal(scheduledAt),
          title: title.trim() || undefined,
          description: description.trim() || undefined,
        },
      );
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el trabajo eventual');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Nuevo trabajo eventual</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Creá un servicio de limpieza checkout sin reserva. Se incluirán las tareas eventuales de
          la zona y sus subzonas.
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <LocationPicker value={location} onChange={setLocation} hideSubzone />

          <div className="form-field">
            <label>Fecha y hora programada *</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Título (opcional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Se genera automáticamente si lo dejás vacío"
            />
          </div>

          <div className="form-field">
            <label>Descripción (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear trabajo eventual'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
