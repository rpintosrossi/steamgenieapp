'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { TASK_FREQUENCIES } from '@steam-genie/shared-constants';
import { LocationPicker } from '../../../components/LocationPicker';
import { api } from '../../../lib/api-client';
import { TASK_FREQUENCY_LABELS } from '../../../lib/labels';
import type { Paginated, TaskItem } from '../../../lib/types';

const PAGE_SIZE = 20;

const FREQUENCY_ORDER = Object.values(TASK_FREQUENCIES);

function formatLocation(task: TaskItem): string {
  const zone = task.zone?.name ?? '—';
  const subzone = task.subzone?.name;
  return subzone ? `${zone} / ${subzone}` : zone;
}

export default function TasksPage() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [buildingFilter, setBuildingFilter] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        includeEventual: 'true',
      });
      if (buildingFilter) params.set('buildingId', buildingFilter);
      if (frequencyFilter) params.set('frequency', frequencyFilter);
      if (activeFilter === 'true') params.set('isActive', 'true');
      if (activeFilter === 'false') params.set('isActive', 'false');
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get<Paginated<TaskItem>>(`/tasks?${params}`);
      setItems(res.data);
      setTotal(res.total);
      setPages(Math.max(1, res.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  }, [page, buildingFilter, frequencyFilter, activeFilter, search]);

  useEffect(() => {
    void api
      .get<{ data: Array<{ id: string; name: string }> }>('/buildings?limit=100')
      .then((res) => setBuildings(res.data))
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const task of items) {
      const list = map.get(task.frequency) ?? [];
      list.push(task);
      map.set(task.frequency, list);
    }

    const order = frequencyFilter
      ? [frequencyFilter]
      : FREQUENCY_ORDER.filter((f) => map.has(f));

    return order.map((freq) => ({
      frequency: freq,
      label: TASK_FREQUENCY_LABELS[freq] ?? freq,
      tasks: map.get(freq) ?? [],
    }));
  }, [items, frequencyFilter]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!location.buildingId || !location.zoneId) {
      setError('Seleccioná edificio y zona.');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/tasks', {
        buildingId: location.buildingId,
        zoneId: location.zoneId,
        subzoneId: location.subzoneId || undefined,
        name,
        frequency,
        requiresPhoto,
        allowsObservation,
        requiresRejectionReason,
        isActive: true,
      });
      setName('');
      setSuccess('Tarea creada.');
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(task: TaskItem) {
    setTogglingId(task.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/tasks/${task.id}`, { isActive: !task.isActive });
      setSuccess(task.isActive ? 'Tarea desactivada.' : 'Tarea activada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la tarea');
    } finally {
      setTogglingId(null);
    }
  }

  function applySearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearFilters() {
    setPage(1);
    setBuildingFilter('');
    setFrequencyFilter('');
    setActiveFilter('');
    setSearchInput('');
    setSearch('');
  }

  const hasFilters = Boolean(buildingFilter || frequencyFilter || activeFilter || search);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tareas</h1>
          <p className="page-subtitle">Definí tareas periódicas y eventuales de checkout.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <h2 className="card-title">Nueva tarea</h2>
        <p className="muted">
          Las tareas <strong>Eventual (checkout)</strong> se usan al crear reservas. Las demás son periódicas.
        </p>
        <form onSubmit={handleCreate} className="stack">
          <LocationPicker value={location} onChange={setLocation} />

          <div className="grid-2">
            <div className="form-field">
              <label>Nombre *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
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
            <label><input type="checkbox" checked={requiresPhoto} onChange={(e) => setRequiresPhoto(e.target.checked)} /> Requiere foto</label>
            <label><input type="checkbox" checked={allowsObservation} onChange={(e) => setAllowsObservation(e.target.checked)} /> Permite observación</label>
            <label><input type="checkbox" checked={requiresRejectionReason} onChange={(e) => setRequiresRejectionReason(e.target.checked)} /> Motivo si no se hace</label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Listado</h2>

        <div className="grid-3" style={{ marginBottom: 12 }}>
          <div className="form-field">
            <label>Edificio</label>
            <select
              value={buildingFilter}
              onChange={(e) => {
                setPage(1);
                setBuildingFilter(e.target.value);
              }}
            >
              <option value="">Todos</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Frecuencia</label>
            <select
              value={frequencyFilter}
              onChange={(e) => {
                setPage(1);
                setFrequencyFilter(e.target.value);
              }}
            >
              <option value="">Todas</option>
              {Object.values(TASK_FREQUENCIES).map((f) => (
                <option key={f} value={f}>{TASK_FREQUENCY_LABELS[f] ?? f}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Estado</label>
            <select
              value={activeFilter}
              onChange={(e) => {
                setPage(1);
                setActiveFilter(e.target.value);
              }}
            >
              <option value="">Todas</option>
              <option value="true">Solo activas</option>
              <option value="false">Solo inactivas</option>
            </select>
          </div>
        </div>

        <form className="inline-form" style={{ marginBottom: 16 }} onSubmit={applySearch}>
          <div className="form-field" style={{ flex: 1 }}>
            <label>Buscar por nombre</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ej: Limpiar baño"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">Buscar</button>
          {hasFilters ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
              Limpiar filtros
            </button>
          ) : null}
        </form>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando tareas…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">No hay tareas con los filtros seleccionados.</p>
        ) : (
          <>
            {groupedItems.map((group) => (
              <section key={group.frequency} className="task-frequency-group">
                <h3 className="task-frequency-group-title">
                  {group.label}
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                    ({group.tasks.length} en esta página)
                  </span>
                </h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Edificio</th>
                        <th>Ubicación</th>
                        <th>Foto</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.tasks.map((task) => (
                        <tr key={task.id} className={!task.isActive ? 'row-muted' : undefined}>
                          <td>{task.name}</td>
                          <td>{task.building?.name ?? '—'}</td>
                          <td>{formatLocation(task)}</td>
                          <td>{task.requiresPhoto ? 'Sí' : 'No'}</td>
                          <td>
                            <span className={`badge ${task.isActive ? 'badge-success' : 'badge-warning'}`}>
                              {task.isActive ? 'Activa' : 'No activa'}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={togglingId === task.id}
                              onClick={() => void toggleActive(task)}
                            >
                              {togglingId === task.id
                                ? 'Guardando…'
                                : task.isActive
                                  ? 'Desactivar'
                                  : 'Activar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            <div className="pagination">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="pagination-info">
                Página {page} de {pages} · {total} tarea{total === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
