'use client';

import { FormEvent, useEffect, useState } from 'react';
import { TASK_CATEGORY_UNCATEGORIZED } from '@steam-genie/shared-constants';
import {
  defaultDatetimeLocal,
  LocationPicker,
  toIsoFromDatetimeLocal,
} from './LocationPicker';
import { api } from '../lib/api-client';
import type { CreateCheckoutCleaningResponse, TaskCategoryItem } from '../lib/types';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTE_OPTIONS = ['00', '15', '30', '45'] as const;

function parseDatetimeLocal(value: string) {
  const [date = '', time = '11:00'] = value.split('T');
  const [hour = '11', minuteRaw = '00'] = time.split(':');
  const minuteNum = Number(minuteRaw);
  const snapped = Number.isFinite(minuteNum)
    ? String(Math.min(45, Math.round(minuteNum / 15) * 15)).padStart(2, '0')
    : '00';
  const minute = (MINUTE_OPTIONS as readonly string[]).includes(snapped) ? snapped : '00';
  return { date, hour: hour.padStart(2, '0'), minute };
}

function buildDatetimeLocal(date: string, hour: string, minute: string) {
  return `${date}T${hour}:${minute}`;
}

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
  const initialScheduled = parseDatetimeLocal(defaultDatetimeLocal(0, 11));
  const [scheduledDate, setScheduledDate] = useState(initialScheduled.date);
  const [scheduledHour, setScheduledHour] = useState(initialScheduled.hour);
  const [scheduledMinute, setScheduledMinute] = useState(initialScheduled.minute);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<TaskCategoryItem[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCategoryOptions = categories.length > 0;
  const scheduledAt = buildDatetimeLocal(scheduledDate, scheduledHour, scheduledMinute);

  useEffect(() => {
    const { buildingId, zoneId } = location;
    if (!buildingId || !zoneId) {
      setCategories([]);
      setSelectedCategoryIds([]);
      return;
    }

    let cancelled = false;
    setLoadingCategories(true);
    const params = new URLSearchParams({
      forEventualService: 'true',
      buildingId,
      zoneId,
    });

    api
      .get<TaskCategoryItem[]>(`/tasks/categories?${params}`)
      .then((data) => {
        if (cancelled) return;
        setCategories(data);
        setSelectedCategoryIds([]);
      })
      .catch(() => {
        if (cancelled) return;
        setCategories([]);
        setSelectedCategoryIds([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });

    return () => {
      cancelled = true;
    };
  }, [location.buildingId, location.zoneId]);

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

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
          ...(selectedCategoryIds.length > 0 ? { categoryIds: selectedCategoryIds } : {}),
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
          Creá un servicio de limpieza checkout sin reserva. Si no elegís categorías, se incluyen
          todas las tareas eventuales. Si elegís una o más (incluida &quot;Sin categoría&quot;), solo
          se incluyen las de esas opciones.
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <LocationPicker value={location} onChange={setLocation} hideSubzone />

          {location.buildingId && location.zoneId ? (
            <div className="form-field">
              <label>Categorías (opcional)</label>
              {loadingCategories ? (
                <p className="muted" style={{ margin: 0 }}>
                  Cargando categorías…
                </p>
              ) : hasCategoryOptions ? (
                <div className="stack" style={{ gap: 8 }}>
                  {categories.map((cat) => (
                    <label key={cat.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.includes(cat.id)}
                        onChange={() => toggleCategory(cat.id)}
                      />
                      {cat.id === TASK_CATEGORY_UNCATEGORIZED ? 'Sin categoría' : cat.name}
                      {cat._count?.tasks != null ? (
                        <span className="muted"> ({cat._count.tasks} tareas)</span>
                      ) : null}
                    </label>
                  ))}
                  {selectedCategoryIds.length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      Sin selección: se incluirán todas las tareas eventuales de la zona.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  No hay tareas eventuales en esta zona. El servicio se creará sin checklist.
                </p>
              )}
            </div>
          ) : null}

          <div className="form-field">
            <label>Fecha y hora programada *</label>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="eventual-scheduled-date">Fecha</label>
                <input
                  id="eventual-scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="eventual-scheduled-hour">Hora</label>
                <select
                  id="eventual-scheduled-hour"
                  value={scheduledHour}
                  onChange={(e) => setScheduledHour(e.target.value)}
                  required
                >
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="eventual-scheduled-minute">Minutos</label>
                <select
                  id="eventual-scheduled-minute"
                  value={scheduledMinute}
                  onChange={(e) => setScheduledMinute(e.target.value)}
                  required
                >
                  {MINUTE_OPTIONS.map((minute) => (
                    <option key={minute} value={minute}>
                      {minute}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
