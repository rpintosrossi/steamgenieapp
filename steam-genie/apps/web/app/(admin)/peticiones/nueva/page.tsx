'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  LocationPicker,
  defaultDatetimeLocal,
  toIsoFromDatetimeLocal,
} from '../../../../components/LocationPicker';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';

type LocationValue = {
  buildingId: string;
  floorId: string;
  zoneId: string;
  subzoneId: string;
};

const EMPTY_LOCATION: LocationValue = {
  buildingId: '',
  floorId: '',
  zoneId: '',
  subzoneId: '',
};

export default function NuevaPeticionPage() {
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [scheduledAt, setScheduledAt] = useState(defaultDatetimeLocal(0, 11));
  const [deadlineAt, setDeadlineAt] = useState(defaultDatetimeLocal(0, 18));
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [zoneHasSubzones, setZoneHasSubzones] = useState(false);

  useEffect(() => {
    void fetchBuildingsList()
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    if (!location.buildingId || !location.zoneId) {
      setZoneHasSubzones(false);
      return;
    }

    void (async () => {
      try {
        const { fetchBuildingHierarchy } = await import('../../../../lib/buildings-cache');
        const hierarchy = await fetchBuildingHierarchy(location.buildingId);
        const zone = hierarchy.floors
          .flatMap((floor: { zones: Array<{ id: string; subzones?: Array<{ id: string }> }> }) => floor.zones)
          .find((z: { id: string; subzones?: Array<{ id: string }> }) => z.id === location.zoneId);
        setZoneHasSubzones((zone?.subzones?.length ?? 0) > 0);
      } catch {
        setZoneHasSubzones(false);
      }
    })();
  }, [location.buildingId, location.zoneId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!location.buildingId || !location.floorId || !location.zoneId) {
      setError('Seleccioná edificio, planta y zona.');
      return;
    }
    if (zoneHasSubzones && !location.subzoneId) {
      setError('Esta zona tiene subzonas. Debés elegir una subzona específica.');
      return;
    }
    if (!description.trim()) {
      setError('La descripción es obligatoria.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ workOrder: { id: string; title: string }; warning?: string }>(
        '/work-orders/additional-request',
        {
          buildingId: location.buildingId,
          floorId: location.floorId,
          zoneId: location.zoneId,
          subzoneId: location.subzoneId || undefined,
          scheduledAt: toIsoFromDatetimeLocal(scheduledAt),
          deadlineAt: deadlineAt ? toIsoFromDatetimeLocal(deadlineAt) : undefined,
          description: description.trim(),
        },
      );
      setSuccess(`Petición creada: ${res.workOrder.title}`);
      setLocation(EMPTY_LOCATION);
      setDescription('');
      setScheduledAt(defaultDatetimeLocal(0, 11));
      setDeadlineAt(defaultDatetimeLocal(0, 18));
      if (res.warning) {
        setSuccess(`${res.workOrder.title}. ${res.warning}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la petición');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nueva petición de servicio</h1>
          <p className="page-subtitle">
            Solicitá un servicio en una zona o subzona de tus edificios habilitados. Si la zona tiene
            subzonas, debés elegir una específica.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <form onSubmit={handleSubmit} className="stack">
          <LocationPicker
            value={location}
            onChange={setLocation}
            buildings={buildings}
            requireSubzone={zoneHasSubzones}
          />

          <div className="grid-2">
            <div className="form-field">
              <label htmlFor="scheduledAt">Fecha y hora solicitada</label>
              <input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="deadlineAt">Hora límite (opcional)</label>
              <input
                id="deadlineAt"
                type="datetime-local"
                value={deadlineAt}
                onChange={(e) => setDeadlineAt(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="description">Descripción *</label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describí el servicio que necesitás…"
              required
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar petición'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
