'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import {
  BUSINESS_TIMEZONE,
  calendarDateKeyInBusinessTz,
  formatStoredCalendarDate,
} from '@steam-genie/shared-constants';
import type {
  AttendanceTimelineItem,
  AttendanceTimelineResponse,
  Paginated,
  UserItem,
} from '../../../../lib/types';

const FILTER_DEBOUNCE_MS = 350;

function todayInputValue(): string {
  return calendarDateKeyInBusinessTz(new Date());
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  });
}

function formatDateLabel(dateStr: string): string {
  return formatStoredCalendarDate(dateStr, 'es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDuration(checkInAt: string, checkOutAt: string | null): string {
  if (!checkOutAt) return 'En curso';
  const ms = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  if (ms <= 0) return '—';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function AttendanceTimelinePage() {
  const [items, setItems] = useState<AttendanceTimelineItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const [date, setDate] = useState(todayInputValue());
  const [buildingFilter, setBuildingFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerOptions, setWorkerOptions] = useState<UserItem[]>([]);
  const [searchingWorkers, setSearchingWorkers] = useState(false);

  const timelineAbortRef = useRef<AbortController | null>(null);
  const workerSearchSeqRef = useRef(0);

  const loadTimeline = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (buildingFilter) params.set('buildingId', buildingFilter);
      if (workerFilter) params.set('userId', workerFilter);

      const res = await api.get<AttendanceTimelineResponse>(`/attendance/timeline?${params}`, {
        signal,
      });
      if (signal?.aborted) return;

      setItems(res.data);
      setTotal(res.total);
      setTruncated(res.truncated);
    } catch (e) {
      if (isAbortError(e) || signal?.aborted) return;
      setError(e instanceof Error ? e.message : 'Error al cargar fichajes');
      setItems([]);
      setTotal(0);
      setTruncated(false);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [date, buildingFilter, workerFilter]);

  useEffect(() => {
    void fetchBuildingsList()
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    timelineAbortRef.current?.abort();
    const controller = new AbortController();
    timelineAbortRef.current = controller;

    const timer = setTimeout(() => {
      void loadTimeline(controller.signal);
    }, FILTER_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadTimeline]);

  useEffect(() => {
    const query = workerSearch.trim();
    if (workerFilter || query.length < 2) {
      setWorkerOptions([]);
      setSearchingWorkers(false);
      return;
    }

    const seq = ++workerSearchSeqRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        setSearchingWorkers(true);
        try {
          const params = new URLSearchParams({
            search: query,
            isActive: 'true',
            limit: '20',
            page: '1',
          });
          const res = await api.get<Paginated<UserItem>>(`/users?${params}`);
          if (seq !== workerSearchSeqRef.current) return;
          setWorkerOptions(res.data);
        } catch {
          if (seq !== workerSearchSeqRef.current) return;
          setWorkerOptions([]);
        } finally {
          if (seq === workerSearchSeqRef.current) setSearchingWorkers(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [workerSearch, workerFilter]);

  function selectWorker(user: UserItem) {
    setWorkerFilter(user.id);
    setWorkerSearch(`${user.fullName} · DNI ${user.dni}`);
    setWorkerOptions([]);
  }

  function clearWorkerFilter() {
    setWorkerFilter('');
    setWorkerSearch('');
    setWorkerOptions([]);
  }

  function refreshNow() {
    timelineAbortRef.current?.abort();
    const controller = new AbortController();
    timelineAbortRef.current = controller;
    void loadTimeline(controller.signal);
  }

  const activeCount = useMemo(
    () => items.filter((item) => !item.checkOutAt).length,
    [items],
  );

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/presencia" className="back-link">
            ← Presencia
          </Link>
          <h1 className="page-title">Timeline de Presencia</h1>
          <p className="page-subtitle">
            Todos los fichajes del día, ordenados cronológicamente.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {truncated ? (
        <div className="alert alert-warning">
          Hay {total} fichajes en este día; se muestran los primeros 2.000. Usá filtros de edificio
          o trabajador para acotar el resultado.
        </div>
      ) : null}

      <div className="card">
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label>Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Edificio</label>
            <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
              <option value="">Todos</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field worker-search-field">
            <label>Trabajador</label>
            <input
              type="search"
              value={workerSearch}
              onChange={(e) => {
                setWorkerSearch(e.target.value);
                if (workerFilter) setWorkerFilter('');
              }}
              placeholder="Buscar por nombre o DNI…"
              autoComplete="off"
            />
            {workerFilter ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm worker-search-clear"
                onClick={clearWorkerFilter}
              >
                Quitar filtro
              </button>
            ) : searchingWorkers ? (
              <span className="muted worker-search-hint">Buscando…</span>
            ) : workerOptions.length > 0 ? (
              <ul className="worker-search-suggestions" role="listbox" aria-label="Trabajadores">
                {workerOptions.map((user) => (
                  <li key={user.id}>
                    <button type="button" role="option" onClick={() => selectWorker(user)}>
                      {user.fullName} · DNI {user.dni}
                    </button>
                  </li>
                ))}
              </ul>
            ) : workerSearch.trim().length >= 2 ? (
              <span className="muted worker-search-hint">Sin resultados</span>
            ) : null}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="btn btn-primary" onClick={refreshNow} disabled={loading}>
            Actualizar
          </button>
        </div>

        <div className="attendance-summary">
          <span>
            <strong>{total}</strong> fichaje{total === 1 ? '' : 's'}
            {truncated ? ' (mostrando 2.000)' : ''}
          </span>
          {activeCount > 0 ? (
            <span className="badge badge-info">{activeCount} en curso</span>
          ) : null}
          <span className="muted">{formatDateLabel(date)}</span>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando fichajes…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">No hay fichajes para los filtros seleccionados.</p>
        ) : (
          <ol className="attendance-timeline" aria-label="Timeline de fichajes">
            {items.map((item) => {
              const isActive = !item.checkOutAt;
              return (
                <li key={item.id} className="attendance-timeline-item">
                  <div className="attendance-timeline-marker" aria-hidden>
                    <span className={`attendance-timeline-dot ${isActive ? 'is-active' : ''}`} />
                  </div>
                  <div className={`attendance-timeline-card ${isActive ? 'is-active' : ''}`}>
                    <div className="attendance-timeline-time">
                      <span className="attendance-timeline-time-label">Entrada</span>
                      <strong>{formatTime(item.checkInAt)}</strong>
                      {item.checkOutAt ? (
                        <>
                          <span className="attendance-timeline-time-sep">→</span>
                          <span className="attendance-timeline-time-label">Salida</span>
                          <strong>{formatTime(item.checkOutAt)}</strong>
                        </>
                      ) : (
                        <span className="badge badge-info">En curso</span>
                      )}
                    </div>
                    <div className="attendance-timeline-body">
                      <div className="attendance-timeline-worker">
                        <span className="attendance-timeline-label">Trabajador</span>
                        <span>{item.user.fullName}</span>
                        <span className="muted">DNI {item.user.dni}</span>
                      </div>
                      <div className="attendance-timeline-building">
                        <span className="attendance-timeline-label">Edificio</span>
                        <span>{item.building.name}</span>
                      </div>
                      <div className="attendance-timeline-duration">
                        <span className="attendance-timeline-label">Duración</span>
                        <span>{formatDuration(item.checkInAt, item.checkOutAt)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}
