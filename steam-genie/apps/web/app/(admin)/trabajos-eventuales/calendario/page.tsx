'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList, fetchBuildingHierarchy } from '../../../../lib/buildings-cache';
import {
  BUSINESS_TIMEZONE,
  businessDayInstantRange,
  calendarDateKeyFromStored,
  calendarDateKeyInBusinessTz,
} from '@steam-genie/shared-constants';
import { WORK_ORDER_STATUS_LABELS } from '../../../../lib/labels';
import type {
  BuildingHierarchy,
  EventualCalendarReservation,
  EventualCalendarResponse,
  EventualCalendarService,
  Paginated,
  UserItem,
} from '../../../../lib/types';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const FILTER_DEBOUNCE_MS = 350;
const CALENDAR_BUILDING_KEY = 'sg_eventual_calendar_building_id';

interface CalendarDay {
  key: string;
  inMonth: boolean;
  label: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function calendarKeyFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return calendarKeyFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function parseMonthInput(value: string): { year: number; month: number } {
  const [y, m] = value.split('-').map(Number);
  return { year: y, month: m };
}

function monthInputValue(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function currentMonthInput(): string {
  const now = new Date();
  return monthInputValue(now.getFullYear(), now.getMonth() + 1);
}

function monthRangeKeys(monthValue: string): { from: string; to: string } {
  const { year, month } = parseMonthInput(monthValue);
  const from = calendarKeyFromParts(year, month, 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = calendarKeyFromParts(year, month, lastDay);
  return { from, to };
}

function buildMonthGrid(monthValue: string): CalendarDay[] {
  const { year, month } = parseMonthInput(monthValue);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday = 0 … Sunday = 6
  const weekday = (firstOfMonth.getUTCDay() + 6) % 7;
  const cells: CalendarDay[] = [];

  for (let i = weekday - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1, 1 - (i + 1)));
    cells.push({
      key: calendarKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      inMonth: false,
      label: d.getUTCDate(),
    });
  }

  for (let day = 1; day <= lastDay; day++) {
    cells.push({
      key: calendarKeyFromParts(year, month, day),
      inMonth: true,
      label: day,
    });
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const nextKey = addDaysToKey(last.key, 1);
    const [y, m, d] = nextKey.split('-').map(Number);
    cells.push({ key: nextKey, inMonth: false, label: d });
  }

  return cells;
}

function formatTimeInstant(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BUSINESS_TIMEZONE,
  });
}

function formatScheduledTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '—';
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) {
    const dayPart = `${days} día${days === 1 ? '' : 's'}`;
    if (hours > 0) return `${dayPart} ${hours} h`;
    return dayPart;
  }
  if (totalHours > 0) return `${totalHours} h ${minutes} min`;
  return `${minutes} min`;
}

function overlapsDay(startIso: string, endIso: string, dayKey: string): boolean {
  const { start, end } = businessDayInstantRange(dayKey);
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return startMs < end.getTime() && endMs > start.getTime();
}

function reservationDayPosition(
  reservation: EventualCalendarReservation,
  dayKey: string,
): 'start' | 'middle' | 'end' | 'single' {
  const checkinKey = calendarDateKeyInBusinessTz(new Date(reservation.checkinAt));
  const checkoutKey = calendarDateKeyInBusinessTz(new Date(reservation.checkoutAt));
  const isStart = dayKey === checkinKey;
  const isEnd = dayKey === checkoutKey;
  if (isStart && isEnd) return 'single';
  if (isStart) return 'start';
  if (isEnd) return 'end';
  return 'middle';
}

function formatAssignees(service: EventualCalendarService): string {
  if (service.activeAssignments.length === 0) return 'Sin asignar';
  return service.activeAssignments
    .map((a) => a.user?.fullName ?? a.userId.slice(0, 8))
    .join(', ');
}

function shiftMonth(monthValue: string, delta: number): string {
  const { year, month } = parseMonthInput(monthValue);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return monthInputValue(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

function monthTitle(monthValue: string): string {
  const { year, month } = parseMonthInput(monthValue);
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function EventualCalendarPage() {
  const [month, setMonth] = useState(currentMonthInput);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [hierarchy, setHierarchy] = useState<BuildingHierarchy | null>(null);
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);

  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerOptions, setWorkerOptions] = useState<UserItem[]>([]);
  const [searchingWorkers, setSearchingWorkers] = useState(false);
  const [showReservations, setShowReservations] = useState(true);
  const [showServices, setShowServices] = useState(true);

  const [data, setData] = useState<EventualCalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [buildingReady, setBuildingReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerSearchSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const gridDays = useMemo(() => buildMonthGrid(month), [month]);
  const { from, to } = useMemo(() => monthRangeKeys(month), [month]);

  const floors = hierarchy?.floors ?? [];
  const zones = useMemo(
    () => floors.find((f) => f.id === floorId)?.zones ?? [],
    [floors, floorId],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<
      string,
      {
        reservations: EventualCalendarReservation[];
        services: EventualCalendarService[];
      }
    >();

    for (const day of gridDays) {
      map.set(day.key, { reservations: [], services: [] });
    }

    if (data && showReservations) {
      for (const r of data.reservations) {
        for (const day of gridDays) {
          if (overlapsDay(r.checkinAt, r.checkoutAt, day.key)) {
            map.get(day.key)?.reservations.push(r);
          }
        }
      }
    }

    if (data && showServices) {
      for (const s of data.services) {
        if (!s.scheduledDate) continue;
        const dayKey = calendarDateKeyFromStored(s.scheduledDate);
        if (map.has(dayKey)) {
          map.get(dayKey)?.services.push(s);
        }
      }
    }

    return map;
  }, [data, gridDays, showReservations, showServices]);

  const loadCalendar = useCallback(async (signal?: AbortSignal) => {
    if (!buildingId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, buildingId });
      if (floorId) params.set('floorId', floorId);
      if (zoneId) params.set('zoneId', zoneId);
      if (workerId) params.set('workerId', workerId);

      const res = await api.get<EventualCalendarResponse>(`/eventual-calendar?${params}`, {
        signal,
      });
      if (signal?.aborted) return;
      setData(res);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Error al cargar calendario');
      setData(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [from, to, buildingId, floorId, zoneId, workerId]);

  useEffect(() => {
    void fetchBuildingsList()
      .then((list) => {
        setBuildings(list);
        const stored = localStorage.getItem(CALENDAR_BUILDING_KEY);
        if (stored && list.some((b) => b.id === stored)) {
          setBuildingId(stored);
        }
      })
      .catch(() => setBuildings([]))
      .finally(() => setBuildingReady(true));
  }, []);

  useEffect(() => {
    if (!buildingId) {
      setHierarchy(null);
      return;
    }
    void (async () => {
      setLoadingHierarchy(true);
      try {
        setHierarchy(await fetchBuildingHierarchy(buildingId));
      } catch {
        setHierarchy(null);
      } finally {
        setLoadingHierarchy(false);
      }
    })();
  }, [buildingId]);

  useEffect(() => {
    if (!buildingReady) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => {
      void loadCalendar(controller.signal);
    }, FILTER_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadCalendar, buildingReady]);

  function handleBuildingChange(id: string) {
    setBuildingId(id);
    setFloorId('');
    setZoneId('');
    if (id) {
      localStorage.setItem(CALENDAR_BUILDING_KEY, id);
    } else {
      localStorage.removeItem(CALENDAR_BUILDING_KEY);
    }
  }

  useEffect(() => {
    const query = workerSearch.trim();
    if (workerId || query.length < 2) {
      setWorkerOptions([]);
      setSearchingWorkers(false);
      return;
    }
    const seq = ++workerSearchSeqRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        setSearchingWorkers(true);
        try {
          const params = new URLSearchParams({ search: query, isActive: 'true', limit: '8' });
          const res = await api.get<Paginated<UserItem>>(`/users?${params}`);
          if (seq !== workerSearchSeqRef.current) return;
          setWorkerOptions(res.data);
        } catch {
          if (seq === workerSearchSeqRef.current) setWorkerOptions([]);
        } finally {
          if (seq === workerSearchSeqRef.current) setSearchingWorkers(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [workerSearch, workerId]);

  const todayKey = calendarDateKeyInBusinessTz(new Date());
  const unassignedCount = data?.services.filter((s) => s.unassigned).length ?? 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendario</h1>
          <p className="page-subtitle">
            Seleccioná un edificio para ver reservas, servicios y asignaciones del mes.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/trabajos-eventuales/reservas" className="btn btn-secondary">
            Reservas
          </Link>
          <Link href="/trabajos-eventuales/servicios" className="btn btn-secondary">
            Servicios
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="filters-grid eventual-calendar-filters">
          <div className="form-field">
            <label>Edificio *</label>
            <select
              value={buildingId}
              onChange={(e) => handleBuildingChange(e.target.value)}
            >
              <option value="">Seleccionar edificio…</option>
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
              value={floorId}
              disabled={!buildingId || loadingHierarchy}
              onChange={(e) => {
                setFloorId(e.target.value);
                setZoneId('');
              }}
            >
              <option value="">{loadingHierarchy ? 'Cargando…' : 'Todas'}</option>
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
              value={zoneId}
              disabled={!floorId || loadingHierarchy}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">Todas</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field eventual-calendar-worker-field">
            <label>Trabajador</label>
            {workerId ? (
              <div className="eventual-calendar-worker-selected">
                <span>{workerSearch || 'Trabajador seleccionado'}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setWorkerId('');
                    setWorkerSearch('');
                  }}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  placeholder="Buscar por nombre…"
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  autoComplete="off"
                />
                {searchingWorkers ? (
                  <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Buscando…
                  </p>
                ) : null}
                {workerOptions.length > 0 ? (
                  <ul className="eventual-calendar-worker-suggestions">
                    {workerOptions.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setWorkerId(u.id);
                            setWorkerSearch(u.fullName);
                            setWorkerOptions([]);
                          }}
                        >
                          {u.fullName}
                          {u.dni ? ` · ${u.dni}` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="form-field eventual-calendar-toggles">
            <label>Mostrar</label>
            <div className="eventual-calendar-toggle-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showReservations}
                  onChange={(e) => setShowReservations(e.target.checked)}
                />
                Reservas
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showServices}
                  onChange={(e) => setShowServices(e.target.checked)}
                />
                Servicios
              </label>
            </div>
          </div>
        </div>

        {data?.truncated.reservations || data?.truncated.services ? (
          <div className="alert alert-warning eventual-calendar-alert">
            Hay más eventos de los mostrados en este mes (
            {data.totals.reservations} reserva{data.totals.reservations === 1 ? '' : 's'},{' '}
            {data.totals.services} servicio{data.totals.services === 1 ? '' : 's'} en total).
            Refiná con planta, zona o trabajador.
          </div>
        ) : null}

        {unassignedCount > 0 ? (
          <div className="alert alert-warning eventual-calendar-alert">
            {unassignedCount} servicio{unassignedCount === 1 ? '' : 's'} sin asignar en este mes
            {unassignedCount === 1 ? '' : ''} — parpadean en rojo en el calendario.
          </div>
        ) : null}

        <div className="eventual-calendar-nav">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ← Anterior
          </button>
          <h2 className="eventual-calendar-month-title">{monthTitle(month)}</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            Siguiente →
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setMonth(currentMonthInput())}
          >
            Hoy
          </button>
        </div>

        <div className="eventual-calendar-legend">
          <span className="eventual-calendar-legend-item">
            <span className="eventual-calendar-legend-swatch is-reservation" aria-hidden />
            Reserva (duración de estadía)
          </span>
          <span className="eventual-calendar-legend-item">
            <span className="eventual-calendar-legend-swatch is-service" aria-hidden />
            Servicio de limpieza
          </span>
          <span className="eventual-calendar-legend-item">
            <span className="eventual-calendar-legend-swatch is-unassigned" aria-hidden />
            Sin asignar
          </span>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        {!buildingId && buildingReady ? (
          <p className="muted eventual-calendar-empty">
            Elegí un edificio arriba para cargar el calendario. Con muchos edificios, la vista
            trabaja edificio por edificio para mantener buen rendimiento.
          </p>
        ) : loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando calendario…</p>
          </div>
        ) : (
          <div className="eventual-calendar-grid-wrap">
            <div className="eventual-calendar-weekdays">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="eventual-calendar-weekday">
                  {label}
                </div>
              ))}
            </div>
            <div className="eventual-calendar-grid">
              {gridDays.map((day) => {
                const bucket = eventsByDay.get(day.key) ?? { reservations: [], services: [] };
                const isToday = day.key === todayKey;
                return (
                  <div
                    key={day.key}
                    className={`eventual-calendar-day ${day.inMonth ? '' : 'is-outside'} ${isToday ? 'is-today' : ''}`}
                  >
                    <div className="eventual-calendar-day-header">
                      <span className="eventual-calendar-day-num">{day.label}</span>
                    </div>
                    <div className="eventual-calendar-day-events">
                      {bucket.reservations.map((r) => {
                        const pos = reservationDayPosition(r, day.key);
                        const guest = r.guestName || r.externalId || 'Huésped';
                        return (
                          <div
                            key={`${r.id}-${day.key}`}
                            className={`eventual-calendar-event is-reservation is-reservation-${pos}`}
                            title={`${guest} · ${formatDurationMs(r.durationMs)} · ${formatTimeInstant(r.checkinAt)} → ${formatTimeInstant(r.checkoutAt)}`}
                          >
                            <span className="eventual-calendar-event-title">{guest}</span>
                            {pos === 'start' || pos === 'single' ? (
                              <span className="eventual-calendar-event-meta">
                                {formatDurationMs(r.durationMs)}
                              </span>
                            ) : null}
                            <span className="eventual-calendar-event-loc">
                              {r.zone?.name ?? '—'}
                              {r.floor?.name ? ` · ${r.floor.name}` : ''}
                            </span>
                          </div>
                        );
                      })}
                      {bucket.services.map((s) => {
                        const time = formatScheduledTime(s.scheduledTime);
                        return (
                          <Link
                            key={s.id}
                            href="/trabajos-eventuales/servicios"
                            className={`eventual-calendar-event is-service ${s.unassigned ? 'is-unassigned' : ''}`}
                            title={`${s.title} · ${WORK_ORDER_STATUS_LABELS[s.status] ?? s.status} · ${formatAssignees(s)}`}
                          >
                            <span className="eventual-calendar-event-title">
                              {time ? `${time} · ` : ''}
                              {s.title}
                            </span>
                            <span className="eventual-calendar-event-meta">
                              {formatAssignees(s)}
                            </span>
                            <span className="eventual-calendar-event-loc">
                              {s.zone?.name ?? '—'}
                              {s.floor?.name ? ` · ${s.floor.name}` : ''}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
