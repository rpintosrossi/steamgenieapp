'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiBaseUrl, getAccessTokenForStream } from '../../../../lib/api-client';
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

type DisplayStatus = 'COMPLETED' | 'NOT_DONE' | 'SKIPPED' | 'OVERDUE' | 'SCHEDULED';

interface TimelineEventPayload {
  type: 'PERIODIC_INSTANCE_MARKED' | 'PERIODIC_INSTANCE_RESET';
  buildingId: string;
  date: string;
  instanceId: string;
  taskId: string;
  instanceStatus: string;
  execution?: {
    id: string;
    status: string; // 'DONE' | 'NOT_DONE' | 'SKIPPED'
    executedAt: string;
    executedBy: { id: string; fullName: string; dni: string };
    observation?: string | null;
    rejectionReason?: { id: string; reason: string } | null;
  } | null;
  emittedAt: string;
}

interface TimelineTaskRow {
  id: string;
  taskId: string;
  name: string;
  isActive: boolean;
  displayStatus: DisplayStatus;
  instanceStatus: string;
  zone?: { id: string; name: string; floor?: { id: string; name: string } | null } | null;
  subzone?: { id: string; name: string } | null;
  execution?: {
    id: string;
    status: string; // 'DONE' | 'NOT_DONE' | 'SKIPPED'
    executedBy?: { id: string; fullName: string; dni: string } | null;
    executedAt?: string | null;
    observation?: string | null;
    rejectionReason?: { id: string; reason: string } | null;
  } | null;
}

const STATUS_CONFIG: Record<DisplayStatus, { label: string; cls: string }> = {
  COMPLETED: { label: 'Realizada',    cls: 'badge-success' },
  NOT_DONE:  { label: 'No realizada', cls: 'badge-error'   },
  SKIPPED:   { label: 'Omitida',      cls: 'badge-neutral' },
  OVERDUE:   { label: 'Atrasada',     cls: 'badge-error'   },
  SCHEDULED: { label: 'Pendiente',    cls: 'badge-warning' },
};

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

function isToday(dateStr: string): boolean {
  return dateStr === calendarDateKeyInBusinessTz(new Date());
}

function formatTaskProgress(total: number, completed: number): string {
  if (total === 0) return 'Sin tareas cargadas';
  const pct = Math.round((completed / total) * 100);
  return `${completed}/${total} tareas (${pct}%)`;
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

  // Per-building task expansion state: key = `${buildingId}:${date}`
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [tasksByKey, setTasksByKey] = useState<Map<string, TimelineTaskRow[]>>(new Map());
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  const timelineAbortRef = useRef<AbortController | null>(null);
  const workerSearchSeqRef = useRef(0);
  const sseRef = useRef<EventSource | null>(null);

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

  useEffect(() => {
    // Only stream real-time updates when viewing today's timeline
    if (!isToday(date)) return;
    if (typeof window === 'undefined') return;

    const token = getAccessTokenForStream();
    if (!token) return;

    const url = `${getApiBaseUrl()}/attendance/timeline/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    sseRef.current = es;

    const handleTimeline = (raw: MessageEvent) => {
      let payload: TimelineEventPayload | null = null;
      try {
        payload = JSON.parse(raw.data) as TimelineEventPayload;
      } catch {
        return;
      }
      if (!payload) return;
      // Ignore events not for the currently displayed date
      if (payload.date !== date) return;

      const isMark = payload.type === 'PERIODIC_INSTANCE_MARKED';
      const isReset = payload.type === 'PERIODIC_INSTANCE_RESET';
      const execStatus = payload.execution?.status; // 'DONE' | 'NOT_DONE' | 'SKIPPED'
      // Only DONE counts as "realizada" in the aggregate — matches backend logic.
      const isDoneMark = isMark && execStatus === 'DONE';

      // 1) Update aggregate counter on the building row
      setItems((prev) =>
        prev.map((it) => {
          if (it.building.id !== payload!.buildingId) return it;
          const total = it.taskProgress?.total ?? 0;
          const prevCompleted = it.taskProgress?.completed ?? 0;
          let nextCompleted = prevCompleted;
          if (isDoneMark) nextCompleted = Math.min(total, prevCompleted + 1);
          else if (isReset) nextCompleted = Math.max(0, prevCompleted - 1);
          if (nextCompleted === prevCompleted) return it;
          return { ...it, taskProgress: { total, completed: nextCompleted } };
        }),
      );

      // 2) Update per-task drill-down row (if already expanded/cached)
      const key = `${payload.buildingId}:${payload.date}`;
      setTasksByKey((prev) => {
        const rows = prev.get(key);
        if (!rows) return prev;
        // Backend returns the periodic-instance id as `id` on each row
        const idx = rows.findIndex((r) => r.id === payload!.instanceId);
        if (idx < 0) return prev;
        const updated = [...rows];
        const current = updated[idx];
        if (isMark && payload.execution) {
          const nextDisplay: DisplayStatus =
            execStatus === 'DONE' ? 'COMPLETED'
            : execStatus === 'NOT_DONE' ? 'NOT_DONE'
            : execStatus === 'SKIPPED' ? 'SKIPPED'
            : current.displayStatus;
          updated[idx] = {
            ...current,
            displayStatus: nextDisplay,
            execution: {
              id: payload.execution.id,
              status: payload.execution.status,
              executedAt: payload.execution.executedAt,
              executedBy: payload.execution.executedBy,
              observation: payload.execution.observation ?? null,
              rejectionReason: payload.execution.rejectionReason ?? null,
            },
          };
        } else if (isReset) {
          updated[idx] = { ...current, displayStatus: 'SCHEDULED', execution: null };
        } else {
          return prev;
        }
        const next = new Map(prev);
        next.set(key, updated);
        return next;
      });
    };

    es.addEventListener('timeline', handleTimeline as EventListener);
    es.onerror = () => {
      // EventSource auto-reconnects with exponential backoff by default.
      // If the token expired we'd get repeated 401s; the periodic refresh via
      // apiClient's next call will refresh the token and the next reconnect will succeed.
    };

    return () => {
      es.removeEventListener('timeline', handleTimeline as EventListener);
      es.close();
      sseRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // When date changes, clear cached task details so they reload fresh
  useEffect(() => {
    setExpandedKeys(new Set());
    setTasksByKey(new Map());
    setLoadingKeys(new Set());
  }, [date]);

  async function toggleBuildingTasks(buildingId: string) {
    const key = `${buildingId}:${date}`;
    if (expandedKeys.has(key)) {
      setExpandedKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
      return;
    }
    setExpandedKeys((prev) => new Set(prev).add(key));
    if (tasksByKey.has(key)) return; // already loaded
    setLoadingKeys((prev) => new Set(prev).add(key));
    try {
      const params = new URLSearchParams({ buildingId, date });
      const res = await api.get<TimelineTaskRow[]>(`/attendance/timeline/tasks?${params}`);
      setTasksByKey((prev) => new Map(prev).set(key, res));
    } catch {
      setTasksByKey((prev) => new Map(prev).set(key, []));
    } finally {
      setLoadingKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  const activeCount = useMemo(
    () => items.filter((item) => !item.checkOutAt).length,
    [items],
  );

  // Aggregate task progress across unique buildings visible in the current filtered results
  const globalTaskProgress = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    let completed = 0;
    for (const item of items) {
      if (!seen.has(item.building.id)) {
        seen.add(item.building.id);
        total += item.taskProgress?.total ?? 0;
        completed += item.taskProgress?.completed ?? 0;
      }
    }
    return { total, completed };
  }, [items]);

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
          {globalTaskProgress.total > 0 ? (
            <span className="attendance-summary-tasks">
              <span className="attendance-timeline-label">Tareas del día</span>
              <span className="attendance-task-global-progress">
                <span className="attendance-task-progress-bar">
                  <span
                    className="attendance-task-progress-fill"
                    style={{
                      width: `${Math.round((globalTaskProgress.completed / globalTaskProgress.total) * 100)}%`,
                    }}
                  />
                </span>
                <strong>
                  {Math.round((globalTaskProgress.completed / globalTaskProgress.total) * 100)}%
                </strong>
                <span className="muted">
                  {globalTaskProgress.completed}/{globalTaskProgress.total}
                </span>
              </span>
            </span>
          ) : null}
          {isToday(date) ? (
            <span className="badge badge-success" title="Actualizaciones en tiempo real (push del servidor)">
              En vivo
            </span>
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
              const taskKey = `${item.building.id}:${date}`;
              const isExpanded = expandedKeys.has(taskKey);
              const isLoadingTasks = loadingKeys.has(taskKey);
              const tasks = tasksByKey.get(taskKey);
              const hasTaskProgress = (item.taskProgress?.total ?? 0) > 0;

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
                    {(item.checkInOutOfRange || item.checkOutOutOfRange) && (
                      <div className="attendance-timeline-gps-warnings">
                        {item.checkInOutOfRange && (
                          <span className="badge badge-warning" title="Entrada fuera del radio GPS del edificio">
                            Entrada fuera de radio
                            {item.checkInDistanceM != null ? ` · ${item.checkInDistanceM} m` : ''}
                            {item.building.gpsRadiusM != null
                              ? ` (máx. ${item.building.gpsRadiusM} m)`
                              : ''}
                          </span>
                        )}
                        {item.checkOutOutOfRange && (
                          <span className="badge badge-warning" title="Salida fuera del radio GPS del edificio">
                            Salida fuera de radio
                            {item.checkOutDistanceM != null ? ` · ${item.checkOutDistanceM} m` : ''}
                            {item.building.gpsRadiusM != null
                              ? ` (máx. ${item.building.gpsRadiusM} m)`
                              : ''}
                          </span>
                        )}
                      </div>
                    )}
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
                      <div className="attendance-timeline-tasks">
                        <span className="attendance-timeline-label">Tareas del edificio</span>
                        {!hasTaskProgress ? (
                          <span className="muted">Sin tareas cargadas</span>
                        ) : (
                          <div className="attendance-task-progress">
                            <div className="attendance-task-progress-bar">
                              <div
                                className="attendance-task-progress-fill"
                                style={{
                                  width: `${Math.round((item.taskProgress!.completed / item.taskProgress!.total) * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="attendance-task-progress-footer">
                              <span className="attendance-task-progress-label">
                                {formatTaskProgress(item.taskProgress!.total, item.taskProgress!.completed)}
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => void toggleBuildingTasks(item.building.id)}
                              >
                                {isExpanded ? '▲ Ocultar' : '▼ Ver tarea por tarea'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="attendance-task-list">
                        {isLoadingTasks ? (
                          <div className="attendance-task-list-loading">
                            <div className="spinner spinner-sm" role="status" aria-label="Cargando tareas" />
                            <span className="muted">Cargando tareas…</span>
                          </div>
                        ) : !tasks || tasks.length === 0 ? (
                          <p className="muted">No hay tareas periódicas para este edificio y fecha.</p>
                        ) : (
                          <ol className="attendance-task-rows" aria-label="Tareas del edificio">
                            {tasks.map((task) => {
                              const cfg = STATUS_CONFIG[task.displayStatus] ?? STATUS_CONFIG.SCHEDULED;
                              const location = [
                                task.zone?.floor?.name,
                                task.zone?.name,
                                task.subzone?.name,
                              ].filter(Boolean).join(' › ');
                              const reason = task.execution?.rejectionReason?.reason;
                              const observation = task.execution?.observation;
                              return (
                                <li key={task.id} className="attendance-task-row">
                                  <span className={`badge ${cfg.cls} attendance-task-status-badge`}>
                                    {cfg.label}
                                  </span>
                                  <span className="attendance-task-row-name">
                                    {task.name}
                                    {!task.isActive ? (
                                      <span className="muted"> (inactiva)</span>
                                    ) : null}
                                  </span>
                                  {location ? (
                                    <span className="attendance-task-row-location muted">{location}</span>
                                  ) : null}
                                  {task.execution?.executedBy ? (
                                    <span className="attendance-task-row-by muted">
                                      por {task.execution.executedBy.fullName}
                                    </span>
                                  ) : null}
                                  {task.displayStatus === 'NOT_DONE' && reason ? (
                                    <span className="attendance-task-row-reason">
                                      Motivo: {reason}
                                    </span>
                                  ) : null}
                                  {observation ? (
                                    <span className="attendance-task-row-observation muted">
                                      “{observation}”
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    )}
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

