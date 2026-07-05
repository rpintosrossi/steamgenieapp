'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../../lib/api-client';
import type { Paginated, UserItem } from '../../../../lib/types';
import { ReportTabs } from '../components/ReportTabs';
import {
  defaultReportDate,
  formatDateTime,
  formatDurationMs,
  MAX_REPORT_RANGE_DAYS,
  toReportIsoRange,
} from '../lib/report-utils';
import { downloadReportCsv } from '../lib/download-report-csv';

type WorkerReport = {
  userId: string;
  userName: string;
  dateFrom: string;
  dateTo: string;
  totalClockedMs: number;
  auxiliaryTimeMs: number;
  zones: Array<{
    zoneId: string;
    zoneName: string;
    floorName: string | null;
    buildingName: string;
    durationMs: number | null;
    source: 'service' | 'periodic';
  }>;
  reportTasks: Array<{
    taskName: string;
    executedAt: string;
    zoneName: string | null;
    buildingName: string;
    reportFields: Array<{ label: string; values: string[] }>;
  }>;
};

export default function ReportePorTrabajadorPage() {
  const [workers, setWorkers] = useState<UserItem[]>([]);
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultReportDate(30));
  const [dateTo, setDateTo] = useState(defaultReportDate(0));
  const [report, setReport] = useState<WorkerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Paginated<UserItem>>('/users?limit=200&role=cleaner&isActive=true')
      .then((res) => {
        setWorkers(res.data);
        if (res.data[0]) setUserId(res.data[0].id);
      })
      .catch(() => setWorkers([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      setError('Seleccioná un trabajador.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const range = toReportIsoRange(dateFrom, dateTo);
      const params = new URLSearchParams({
        userId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      });
      const data = await api.get<WorkerReport>(`/reports/by-worker?${params}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    if (!userId) {
      setError('Seleccioná un trabajador.');
      return;
    }

    setExporting(true);
    setError(null);
    try {
      const range = toReportIsoRange(dateFrom, dateTo);
      const params = new URLSearchParams({
        userId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      });
      await downloadReportCsv(
        '/reports/by-worker/export',
        params,
        'reporte-por-trabajador',
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
            Horas fichadas, tiempo por zona y tiempo auxiliar remanente. Solo se listan tareas con
            campos marcados para el reporte. Rango máximo de {MAX_REPORT_RANGE_DAYS} días.
          </p>
        </div>
      </div>

      <ReportTabs />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <form onSubmit={handleSubmit} className="grid-3" style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label>Trabajador</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.fullName}
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
          <div className="stack" style={{ gap: 20 }}>
            <div className="grid-3">
              <div className="card" style={{ margin: 0 }}>
                <p className="muted" style={{ margin: '0 0 4px' }}>
                  Horas totales fichadas
                </p>
                <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                  {formatDurationMs(report.totalClockedMs)}
                </p>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <p className="muted" style={{ margin: '0 0 4px' }}>
                  Tiempo auxiliar remanente
                </p>
                <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                  {formatDurationMs(report.auxiliaryTimeMs)}
                </p>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <p className="muted" style={{ margin: '0 0 4px' }}>
                  Trabajador
                </p>
                <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                  {report.userName}
                </p>
              </div>
            </div>

            <div>
              <h3 style={{ marginTop: 0 }}>Zonas fichadas</h3>
              {report.zones.length === 0 ? (
                <p className="muted">Sin zonas registradas en el período.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Edificio</th>
                        <th>Planta</th>
                        <th>Zona</th>
                        <th>Tiempo</th>
                        <th>Origen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.zones.map((zone) => (
                        <tr key={`${zone.buildingName}-${zone.zoneId}`}>
                          <td>{zone.buildingName}</td>
                          <td>{zone.floorName ?? '—'}</td>
                          <td>{zone.zoneName}</td>
                          <td>{formatDurationMs(zone.durationMs)}</td>
                          <td>{zone.source === 'service' ? 'Servicio' : 'Recurrente'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {report.reportTasks.length > 0 ? (
              <div>
                <h3>Tareas con campos de reporte</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Tarea</th>
                        <th>Edificio / Zona</th>
                        <th>Fecha</th>
                        <th>Campos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.reportTasks.map((task, index) => (
                        <tr key={`${task.taskName}-${index}`}>
                          <td>{task.taskName}</td>
                          <td>
                            {task.buildingName}
                            {task.zoneName ? ` / ${task.zoneName}` : ''}
                          </td>
                          <td>{formatDateTime(task.executedAt)}</td>
                          <td>
                            {task.reportFields
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
          </div>
        ) : (
          <p className="muted">Elegí trabajador y rango de fechas para ver el reporte.</p>
        )}
      </div>
    </>
  );
}
