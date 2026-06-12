'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import type { BuildingDetail } from '../lib/types';

interface LocationPickerValue {
  buildingId: string;
  floorId: string;
  zoneId: string;
  subzoneId: string;
}

interface LocationPickerProps {
  value: LocationPickerValue;
  onChange: (value: LocationPickerValue) => void;
  requireSubzone?: boolean;
  hideSubzone?: boolean;
}

export function LocationPicker({
  value,
  onChange,
  requireSubzone = false,
  hideSubzone = false,
}: LocationPickerProps) {
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [buildingDetail, setBuildingDetail] = useState<BuildingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const res = await api.get<{ data: Array<{ id: string; name: string }> }>('/buildings?limit=100');
        setBuildings(res.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar edificios');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!value.buildingId) {
      setBuildingDetail(null);
      return;
    }
    void (async () => {
      try {
        const detail = await api.get<BuildingDetail>(`/buildings/${value.buildingId}`);
        setBuildingDetail(detail);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar la jerarquía');
      }
    })();
  }, [value.buildingId]);

  const floors = buildingDetail?.floors ?? [];
  const zones = useMemo(
    () => floors.find((f) => f.id === value.floorId)?.zones ?? [],
    [floors, value.floorId],
  );
  const subzones = useMemo(
    () => zones.find((z) => z.id === value.zoneId)?.subzones ?? [],
    [zones, value.zoneId],
  );

  function patch(partial: Partial<LocationPickerValue>) {
    onChange({ ...value, ...partial });
  }

  if (loading) return <p className="muted">Cargando ubicaciones…</p>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="grid-2">
      <div className="form-field">
        <label>Edificio</label>
        <select
          value={value.buildingId}
          onChange={(e) =>
            patch({ buildingId: e.target.value, floorId: '', zoneId: '', subzoneId: '' })
          }
        >
          <option value="">Seleccionar…</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>Planta</label>
        <select
          value={value.floorId}
          disabled={!value.buildingId}
          onChange={(e) => patch({ floorId: e.target.value, zoneId: '', subzoneId: '' })}
        >
          <option value="">Seleccionar…</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>Zona</label>
        <select
          value={value.zoneId}
          disabled={!value.floorId}
          onChange={(e) => patch({ zoneId: e.target.value, subzoneId: '' })}
        >
          <option value="">Seleccionar…</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </div>

      {!hideSubzone ? (
        <div className="form-field">
          <label>Subzona{requireSubzone ? ' *' : ''}</label>
          <select
            value={value.subzoneId}
            disabled={!value.zoneId || subzones.length === 0}
            onChange={(e) => patch({ subzoneId: e.target.value })}
          >
            <option value="">{subzones.length ? 'Seleccionar…' : 'Sin subzonas'}</option>
            {subzones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function toIsoFromDatetimeLocal(value: string): string {
  if (!value) return '';
  return new Date(value).toISOString();
}

export function defaultDatetimeLocal(daysOffset = 0, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
