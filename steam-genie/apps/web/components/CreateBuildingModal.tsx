'use client';

import { FormEvent, useState } from 'react';
import { api } from '../lib/api-client';
import type { Building } from '../lib/types';

type CreateBuildingModalProps = {
  onClose: () => void;
  onCreated: (building: Building) => void;
};

export function CreateBuildingModal({ onClose, onCreated }: CreateBuildingModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const building = await api.post<Building>('/buildings', {
        name: name.trim(),
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
      });
      onCreated(building);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el edificio');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Nuevo edificio</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Completá los datos básicos. Después podés configurar plantas, zonas y tareas desde el
          detalle del edificio.
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <div className="form-field">
            <label>Nombre *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Edificio Central"
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label>Dirección</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle y número"
            />
          </div>

          <div className="grid-2">
            <div className="form-field">
              <label>Ciudad</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Provincia</label>
              <input value={province} onChange={(e) => setProvince(e.target.value)} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating || !name.trim()}>
              {creating ? 'Creando…' : 'Crear edificio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
