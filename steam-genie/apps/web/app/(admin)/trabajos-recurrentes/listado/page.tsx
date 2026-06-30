'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import {
  RECURRING_WORK_STATUS_LABELS,
  TASK_EXECUTION_STATUS_LABELS,
  TASK_FREQUENCY_LABELS,
} from '../../../../lib/labels';
import type { Paginated, RecurringWorkListItem } from '../../../../lib/types';
import { LocationDisplay } from '../../../../components/LocationDisplay';

const PAGE_SIZE = 20;

const STATUS_BADGE_CLASS: Record<string, string> = {
  COMPLETED: 'badge-success',
  SCHEDULED: 'badge-info',
  OVERDUE: 'badge-warning',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function RecurringWorkListPage() {
  const [items, setItems] = useState<RecurringWorkListItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [buildingFilter, setBuildingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodDate, setPeriodDate] = useState(todayInputValue());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        periodDate,
      });
      if (buildingFilter) params.set('buildingId', buildingFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get<Paginated<RecurringWorkListItem>>(
        `/tasks/recurring-work/list?${params}`,
      );
      setItems(res.data);
      setTotal(res.total);
      setPages(Math.max(1, res.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar trabajos recurrentes');
    } finally {
      setLoading(false);
    }
  }, [page, buildingFilter, statusFilter, periodDate, search]);

  useEffect(() => {
    void fetchBuildingsList()
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearFilters() {
    setPage(1);
    setBuildingFilter('');
    setStatusFilter('');
    setPeriodDate(todayInputValue());
    setSearchInput('');
    setSearch('');
  }

  const hasFilters = Boolean(buildingFilter || statusFilter || search || periodDate !== todayInputValue());

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/trabajos-recurrentes" className="back-link">
            ← Trabajos recurrentes
          </Link>
          <h1 className="page-title">Listado de Trabajos</h1>
          <p className="page-subtitle">
            Tareas periódicas (no eventuales) con estado del período, responsable y evidencias.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <form className="inline-form" style={{ marginBottom: 16 }} onSubmit={applySearch}>
          <div className="form-field" style={{ flex: 1 }}>
            <label>Buscar tarea</label>
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
            <label>Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(RECURRING_WORK_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Fecha de referencia (período)</label>
            <input
              type="date"
              value={periodDate}
              onChange={(e) => {
                setPage(1);
                setPeriodDate(e.target.value);
              }}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando trabajos…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">No hay trabajos recurrentes con los filtros seleccionados.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>Frecuencia</th>
                    <th>Edificio</th>
                    <th>Ubicación</th>
                    <th>Período</th>
                    <th>Estado</th>
                    <th>Completado por</th>
                    <th>Fecha y hora</th>
                    <th>Resultado</th>
                    <th>Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.taskName}</td>
                      <td>{TASK_FREQUENCY_LABELS[item.frequency] ?? item.frequency}</td>
                      <td>{item.building?.name ?? '—'}</td>
                      <td>
                        <LocationDisplay
                          floor={item.floor}
                          zone={item.zone}
                          subzone={item.subzone}
                        />
                      </td>
                      <td>{item.periodLabelDisplay}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE_CLASS[item.displayStatus] ?? ''}`}>
                          {RECURRING_WORK_STATUS_LABELS[item.displayStatus] ?? item.displayStatus}
                        </span>
                      </td>
                      <td>{item.execution?.executedBy.fullName ?? '—'}</td>
                      <td>{formatDateTime(item.execution?.executedAt ?? item.completedAt)}</td>
                      <td>
                        {item.execution
                          ? (TASK_EXECUTION_STATUS_LABELS[item.execution.status] ??
                            item.execution.status)
                          : '—'}
                      </td>
                      <td>
                        {item.execution?.photos.length ? (
                          <div className="photo-thumbs">
                            {item.execution.photos.map((photo) => (
                              <a
                                key={photo.id}
                                href={photo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={photo.originalFilename ?? 'Ver foto'}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo.url} alt="" className="photo-thumb" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
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
                Página {page} de {pages} · {total} trabajo{total === 1 ? '' : 's'}
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
