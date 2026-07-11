'use client';

import { FormEvent, useState } from 'react';
import { api } from '../lib/api-client';
import type { BuildingDetail } from '../lib/types';
import {
  BuildingLocationFields,
  type BuildingLocationFieldsValue,
} from './BuildingLocationFields';

type BuildingSettingsCardProps = {
  building: BuildingDetail;
  onSaved: (building: BuildingDetail) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

function toInputValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  return String(value);
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function BuildingSettingsCard({
  building,
  onSaved,
  onError,
  onSuccess,
}: BuildingSettingsCardProps) {
  const [name, setName] = useState(building.name);
  const [location, setLocation] = useState<BuildingLocationFieldsValue>({
    address: building.address ?? '',
    province: building.province ?? '',
    city: building.city ?? '',
    latitude: toInputValue(building.latitude),
    longitude: toInputValue(building.longitude),
    gpsRadiusM: String(building.gpsRadiusM ?? 200),
    requireGpsValidation: building.requireGpsValidation !== false,
  });
  const [isActive, setIsActive] = useState(building.isActive !== false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError('');

    try {
      const lat = parseOptionalNumber(location.latitude);
      const lng = parseOptionalNumber(location.longitude);
      const radius = parseOptionalNumber(location.gpsRadiusM);

      if (location.requireGpsValidation && (lat == null || lng == null)) {
        onError('Seleccioná la ubicación del edificio en el mapa.');
        setSaving(false);
        return;
      }

      const updated = await api.patch<BuildingDetail>(`/buildings/${building.id}`, {
        name: name.trim(),
        address: location.address.trim() || null,
        city: location.city.trim() || null,
        province: location.province.trim() || null,
        requireGpsValidation: location.requireGpsValidation,
        latitude: lat ?? null,
        longitude: lng ?? null,
        gpsRadiusM: radius,
        isActive,
      });
      onSaved({ ...building, ...updated });
      onSuccess('Configuración del edificio guardada.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 className="card-title" style={{ marginTop: 0 }}>
        Configuración
      </h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Datos del edificio, provincia/ciudad y ubicación para validación GPS.
      </p>

      <form onSubmit={handleSubmit} className="stack">
        <div className="form-field">
          <label>Nombre *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <BuildingLocationFields
          value={location}
          onChange={(patch) => setLocation((prev) => ({ ...prev, ...patch }))}
          showActiveToggle
          isActive={isActive}
          onActiveChange={setIsActive}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </div>
  );
}
