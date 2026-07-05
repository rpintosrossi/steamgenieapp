'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { TASK_FREQUENCIES, APP_MODULES } from '@steam-genie/shared-constants';
import { CreateTaskModal } from '../../../components/CreateTaskModal';
import { EditTaskModal } from '../../../components/EditTaskModal';
import { TasksSubnav } from '../../../components/TasksSubnav';
import { api } from '../../../lib/api-client';
import { fetchBuildingsList } from '../../../lib/buildings-cache';
import { hasModule } from '../../../lib/auth';
import { TASK_FREQUENCY_LABELS } from '../../../lib/labels';
import type { Paginated, TaskItem } from '../../../lib/types';
import { LocationDisplay } from '../../../components/LocationDisplay';

const PAGE_SIZE = 20;

export default function TasksPage() {
  const readOnly = hasModule(APP_MODULES.TASKS) && !hasModule(APP_MODULES.BUILDINGS);
  const [items, setItems] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [buildingFilter, setBuildingFilter] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

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
    void fetchBuildingsList()
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  function handleSaved() {
    setEditingTaskId(null);
    setSuccess('Tarea actualizada.');
    void load();
  }

  function handleCreated() {
    setCreateOpen(false);
    setSuccess('Tarea creada.');
    setPage(1);
    void load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          {!readOnly ? (
            <Link href="/configuracion" className="back-link">
              ← Configuración
            </Link>
          ) : (
            <Link href="/dashboard" className="back-link">
              ← Inicio
            </Link>
          )}
          <h1 className="page-title">Tareas</h1>
          <p className="page-subtitle">
            {readOnly
              ? 'Consulta de tareas en tus edificios habilitados. Solo lectura.'
              : 'Definí tareas periódicas y eventuales de checkout.'}
          </p>
        </div>
        {!readOnly ? (
          <div className="page-header-actions">
            <Link href="/tasks/motivos" className="btn btn-secondary btn-sm">
              Motivos de no realización
            </Link>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setCreateOpen(true);
                setError(null);
                setSuccess(null);
              }}
            >
              Crear tarea
            </button>
          </div>
        ) : null}
      </div>

      {!readOnly ? <TasksSubnav /> : null}

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <form className="inline-form" style={{ marginBottom: 16 }} onSubmit={applySearch}>
          <div className="form-field" style={{ flex: 1 }}>
            <label>Buscar por nombre</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ej: Limpiar baño"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">
            Buscar
          </button>
          {hasFilters ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
              Limpiar filtros
            </button>
          ) : null}
        </form>

        <div className="grid-3" style={{ marginBottom: 16 }}>
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
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
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
                <option key={f} value={f}>
                  {TASK_FREQUENCY_LABELS[f] ?? f}
                </option>
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

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando tareas…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">No hay tareas con los filtros seleccionados.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Frecuencia</th>
                    <th>Edificio</th>
                    <th>Ubicación</th>
                    <th>Foto</th>
                    <th>Estado</th>
                    {!readOnly ? <th>Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((task) => (
                    <tr key={task.id} className={!task.isActive ? 'row-muted' : undefined}>
                      <td>{task.name}</td>
                      <td>{TASK_FREQUENCY_LABELS[task.frequency] ?? task.frequency}</td>
                      <td>{task.building?.name ?? '—'}</td>
                      <td>
                        <LocationDisplay
                          floor={task.zone?.floor}
                          zone={task.zone}
                          subzone={task.subzone}
                        />
                      </td>
                      <td>{task.requiresPhoto ? 'Sí' : 'No'}</td>
                      <td>
                        <span className={`badge ${task.isActive ? 'badge-success' : 'badge-warning'}`}>
                          {task.isActive ? 'Activa' : 'No activa'}
                        </span>
                      </td>
                      {!readOnly ? (
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setEditingTaskId(task.id);
                                setError(null);
                                setSuccess(null);
                              }}
                            >
                              Configurar
                            </button>
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
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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

      {!readOnly && createOpen ? (
        <CreateTaskModal
          buildings={buildings}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}

      {!readOnly && editingTaskId ? (
        <EditTaskModal
          taskId={editingTaskId}
          buildings={buildings}
          onClose={() => setEditingTaskId(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}
