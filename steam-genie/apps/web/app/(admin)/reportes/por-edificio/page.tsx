'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList, fetchBuildingHierarchy } from '../../../../lib/buildings-cache';
import { TASK_EXECUTION_STATUS_LABELS, WORK_ORDER_TYPE_LABELS } from '../../../../lib/labels';
import { ReportTabs } from '../components/ReportTabs';
import {
  defaultReportDate,
  formatDateTime,
  MAX_REPORT_RANGE_DAYS,
  REPORT_PAGE_SIZE,
  toReportIsoRange,
} from '../lib/report-utils';
import { downloadReportCsv } from '../lib/download-report-csv';

const REPORT_WORK_ORDER_TYPE_LABELS: Record<string, string> = {
  ...WORK_ORDER_TYPE_LABELS,
  CHECKOUT_CLEANING: 'Trabajo Eventual',
};

type ReportService = {
  id: string;
  type: string;
  title: string;
  scheduledDate: string | null;
  completedAt: string | null;
  location: {
    building: string | null;
    floor: string | null;
    zone: string | null;
    subzone: string | null;
  };
  workers: string[];
  tasks: Array<{
    name: string;
    status: string;
    executedAt: string;
    executedBy: string;
    reportFields: Array<{ label: string; values: string[] }>;
  }>;
};

type PeriodicTaskRow = {
  id: string;
  name: string;
  status: string;
  executedAt: string;
  executedBy: string;
  location: {
    floor: string | null;
    zone: string | null;
    subzone: string | null;
  };
  reportFields: Array<{ label: string; values: string[] }>;
};

type BuildingReport = {
  buildingId: string;
  dateFrom: string;
  dateTo: string;
  services: ReportService[];
  periodicTasks: PeriodicTaskRow[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export default function ReportePorEdificioPage() {
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultReportDate(30));
  const [dateTo, setDateTo] = useState(defaultReportDate(0));
  const [report, setReport] = useState<BuildingReport | null>(null);
  const [servicePage, setServicePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [floors, setFloors] = useState<Array<{ id: string; name: string; zones: Array<{ id: string; name: string }> }>>(
    [],
  );

  useEffect(() => {
    void fetchBuildingsList()
      .then((items) => {
        setBuildings(items);
        if (items[0]) setBuildingId(items[0].id);
      })
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    if (!buildingId) {
      setFloors([]);
      setFloorId('');
      setZoneId('');
      return;
    }
    setHierarchyLoading(true);
    void fetchBuildingHierarchy(buildingId)
      .then((h) => {
        setFloors(h.floors);
        setFloorId('');
        setZoneId('');
      })
      .catch(() => setFloors([]))
      .finally(() => setHierarchyLoading(false));
  }, [buildingId]);

  const zones = useMemo(
    () => floors.find((f) => f.id === floorId)?.zones ?? [],
    [floors, floorId],
  );

  async function loadReport(page = 1) {
    if (!buildingId) {
      setError('Seleccioná un edificio.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const range = toReportIsoRange(dateFrom, dateTo);
      const params = new URLSearchParams({
        buildingId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        page: String(page),
        limit: String(REPORT_PAGE_SIZE),
      });
      if (floorId) params.set('floorId', floorId);
      if (zoneId) params.set('zoneId', zoneId);
      const data = await api.get<BuildingReport>(`/reports/building?${params}`);
      setReport(data);
      setServicePage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServicePage(1);
    await loadReport(1);
  }

  async function handleExportCsv() {
    if (!buildingId) {
      setError('Seleccioná un edificio.');
      return;
    }

    setExporting(true);
    setError(null);
    try {
      const range = toReportIsoRange(dateFrom, dateTo);
      const params = new URLSearchParams({
        buildingId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      });
      if (floorId) params.set('floorId', floorId);
      if (zoneId) params.set('zoneId', zoneId);
      await downloadReportCsv(
        '/reports/building/export',
        params,
        'reporte-por-edificio',
        dateFrom,
        dateTo,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar el CSV');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes</h1>
          <p className="page-subtitle">
            Servicios realizados y tareas fichadas por edificio, con campos personalizados del
            reporte. Rango máximo de {MAX_REPORT_RANGE_DAYS} días.
          </p>
        </div>
      </div>

      <ReportTabs />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <form onSubmit={handleSubmit} className="grid-3" style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label>Edificio</label>
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Planta (opcional)</label>
            <select
              value={floorId}
              onChange={(e) => {
                setFloorId(e.target.value);
                setZoneId('');
              }}
              disabled={hierarchyLoading || floors.length === 0}
            >
              <option value="">Todas</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Zona (opcional)</label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              disabled={!floorId || zones.length === 0}
            >
              <option value="">Todas</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required />
          </div>
          <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="btn btn-primary" disabled={loading || exporting}>
              {loading ? 'Generando…' : 'Generar reporte'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading || exporting}
              onClick={() => void handleExportCsv()}
            >
              {exporting ? 'Exportando…' : 'Exportar CSV'}
            </button>
          </div>
        </form>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Generando reporte…</p>
          </div>
        ) : report ? (
          report.total === 0 && report.periodicTasks.length === 0 ? (
            <p className="muted">No hay servicios ni tareas en el período seleccionado.</p>
          ) : (
            <>
              {report.services.length > 0 ? (
                <div className="stack" style={{ gap: 16 }}>
                  <h3 style={{ margin: 0 }}>Servicios realizados</h3>
                  {report.services.map((service) => (
                    <div key={service.id} className="card" style={{ margin: 0 }}>
                      <h4 style={{ marginTop: 0 }}>{service.title}</h4>
                      <p className="muted" style={{ marginTop: 0 }}>
                        {REPORT_WORK_ORDER_TYPE_LABELS[service.type] ?? service.type} ·{' '}
                        {service.location.floor ?? '—'} / {service.location.zone ?? '—'}
                        {service.location.subzone ? ` / ${service.location.subzone}` : ''} ·{' '}
                        {formatStoredCalendarDate(service.scheduledDate, 'es-AR')} · Completado:{' '}
                        {formatDateTime(service.completedAt)}
                      </p>
                      {service.workers.length > 0 ? (
                        <p className="muted">Trabajadores: {service.workers.join(', ')}</p>
                      ) : null}

                      {service.tasks.length > 0 ? (
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Tarea</th>
                                <th>Estado</th>
                                <th>Ejecutada por</th>
                                <th>Campos del reporte</th>
                              </tr>
                            </thead>
                            <tbody>
                              {service.tasks.map((task, index) => (
                                <tr key={`${service.id}-${index}`}>
                                  <td>{task.name}</td>
                                  <td>{TASK_EXECUTION_STATUS_LABELS[task.status] ?? task.status}</td>
                                  <td>{task.executedBy}</td>
                                  <td>
                                    {task.reportFields.length === 0
                                      ? '—'
                                      : task.reportFields
                                          .map(
                                            (field) =>
                                              `${field.label}: ${field.values.join(', ') || '—'}`,
                                          )
                                          .join(' · ')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted">Sin tareas registradas en este servicio.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {report.periodicTasks.length > 0 ? (
                <div style={{ marginTop: 24 }}>
                  <h3>Tareas recurrentes fichadas</h3>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tarea</th>
                          <th>Ubicación</th>
                          <th>Ejecutada por</th>
                          <th>Fecha</th>
                          <th>Campos del reporte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.periodicTasks.map((task) => (
                          <tr key={task.id}>
                            <td>{task.name}</td>
                            <td>
                              {[task.location.floor, task.location.zone, task.location.subzone]
                                .filter(Boolean)
                                .join(' / ') || '—'}
                            </td>
                            <td>{task.executedBy}</td>
                            <td>{formatDateTime(task.executedAt)}</td>
                            <td>
                              {task.reportFields.length === 0
                                ? '—'
                                : task.reportFields
                                    .map((f) => `${f.label}: ${f.values.join(', ') || '—'}`)
                                    .join(' · ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {report.pages > 1 ? (
                <div className="pagination" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={servicePage <= 1 || loading}
                    onClick={() => void loadReport(servicePage - 1)}
                  >
                    Anterior
                  </button>
                  <span className="pagination-info">
                    Página {servicePage} de {report.pages} · {report.total} servicio
                    {report.total === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={servicePage >= report.pages || loading}
                    onClick={() => void loadReport(servicePage + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
            </>
          )
        ) : (
          <p className="muted">Elegí edificio y rango de fechas para ver el reporte.</p>
        )}
      </div>
    </>
  );
}
