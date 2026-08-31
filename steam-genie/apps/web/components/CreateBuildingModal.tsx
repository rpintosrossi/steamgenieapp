'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import type { Building, QuoteBranchItem } from '../lib/types';
import {
  BuildingLocationFields,
  type BuildingLocationFieldsValue,
} from './BuildingLocationFields';

type CreateBuildingModalProps = {
  onClose: () => void;
  onCreated: (building: Building) => void;
};

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function CreateBuildingModal({ onClose, onCreated }: CreateBuildingModalProps) {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [location, setLocation] = useState<BuildingLocationFieldsValue>({
    address: '',
    province: '',
    city: '',
    latitude: '',
    longitude: '',
    gpsRadiusM: '200',
    requireGpsValidation: true,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<QuoteBranchItem[]>([]);
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api
      .get<QuoteBranchItem[]>('/quote-branches?includeInactive=false')
      .then((data) => {
        if (cancelled) return;
        setBranches(data);
        const preferred = data.find((row) => row.isDefault) ?? data[0];
        if (preferred) setBranchId(preferred.id);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar las sucursales');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const lat = parseOptionalNumber(location.latitude);
      const lng = parseOptionalNumber(location.longitude);
      const radius = parseOptionalNumber(location.gpsRadiusM);

      if (location.requireGpsValidation && (lat == null || lng == null)) {
        setError('Seleccioná la ubicación del edificio en el mapa.');
        setCreating(false);
        return;
      }

      if (!branchId) {
        setError('Seleccioná la sucursal del edificio.');
        setCreating(false);
        return;
      }

      const building = await api.post<Building>('/buildings', {
        name: name.trim(),
        ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
        address: location.address.trim() || undefined,
        city: location.city.trim() || undefined,
        province: location.province.trim() || undefined,
        requireGpsValidation: location.requireGpsValidation,
        latitude: lat,
        longitude: lng,
        gpsRadiusM: radius,
        branchId,
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
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Nuevo edificio</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Completá los datos básicos y la ubicación. Después podés configurar plantas, zonas y
          tareas desde el detalle del edificio.
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
            <label>Sucursal *</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
              <option value="" disabled>
                Seleccioná una sucursal
              </option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isDefault ? ' (predeterminada)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>CUIT</label>
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="Opcional"
              maxLength={20}
            />
          </div>

          <BuildingLocationFields
            value={location}
            onChange={(patch) => setLocation((prev) => ({ ...prev, ...patch }))}
          />

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating || !name.trim() || !branchId}>
              {creating ? 'Creando…' : 'Crear edificio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
