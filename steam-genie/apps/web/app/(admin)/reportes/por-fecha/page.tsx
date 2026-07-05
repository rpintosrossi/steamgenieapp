'use client';

import { FormEvent, useEffect, useState } from 'react';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import type { Paginated, UserItem } from '../../../../lib/types';
import { ReportTabs } from '../components/ReportTabs';
import {
  defaultReportDate,
  MAX_REPORT_RANGE_DAYS,
  REPORT_PAGE_SIZE,
  toReportIsoRange,
} from '../lib/report-utils';
import { downloadReportCsv } from '../lib/download-report-csv';

type DateReportRow = {
  date: string;
  worker: { id: string; fullName: string };
  buildings: Array<{ id: string; name: string }>;
  cleanedZones: Array<{
    zoneId: string;
    zoneName: string;
    floorId: string | null;
    floorName: string | null;
    buildingId: string;
    buildingName: string;
  }>;
};

type DateReport = {
  dateFrom: string;
  dateTo: string;
  rows: DateReportRow[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export default function ReportePorFechaPage() {
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [workers, setWorkers] = useState<UserItem[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultReportDate(30));
  const [dateTo, setDateTo] = useState(defaultReportDate(0));
  const [report, setReport] = useState<DateReport | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBuildingsList()
      .then(setBuildings)
      .catch(() => setBuildings([]));
    void api
      .get<Paginated<UserItem>>('/users?limit=200&role=cleaner')
      .then((res) => setWorkers(res.data))
      .catch(() => setWorkers([]));
  }, []);

  async function loadReport(nextPage = 1) {
    setLoading(true);
    setError(null);
    try {
      const range = toReportIsoRange(dateFrom, dateTo);
      const params = new URLSearchParams({
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        page: String(nextPage),
        limit: String(REPORT_PAGE_SIZE),
      });
      if (buildingId) params.set('buildingId', buildingId);
      if (userId) params.set('userId', userId);
      const data = await api.get<DateReport>(`/reports/by-date?${params}`);
      setReport(data);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    await loadReport(1);
  }

  function buildQueryParams(): URLSearchParams {
    const range = toReportIsoRange(dateFrom, dateTo);
    const params = new URLSearchParams({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    });
    if (buildingId) params.set('buildingId', buildingId);
    if (userId) params.set('userId', userId);
    return params;
  }

  async function handleExportCsv() {
    setExporting(true);
    setError(null);
    try {
      await downloadReportCsv(
        '/reports/by-date/export',
        buildQueryParams(),
        'reporte-por-fecha',
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
            Actividad diaria por trabajador: edificios visitados y zonas limpiadas. Rango máximo de{' '}
            {MAX_REPORT_RANGE_DAYS} días.
          </p>
        </div>
      </div>

      <ReportTabs />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <form onSubmit={handleSubmit} className="grid-3" style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label>Edificio (opcional)</label>
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
              <option value="">Todos</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Trabajador (opcional)</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Todos</option>
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
          report.total === 0 ? (
            <p className="muted">No hay actividad en el período seleccionado.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Trabajador</th>
                      <th>Edificios</th>
                      <th>Zonas limpiadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={`${row.date}-${row.worker.id}`}>
                        <td>{formatStoredCalendarDate(`${row.date}T00:00:00.000Z`, 'es-AR')}</td>
                        <td>{row.worker.fullName}</td>
                        <td>{row.buildings.map((b) => b.name).join(', ') || '—'}</td>
                        <td>
                          {row.cleanedZones.length === 0
                            ? '—'
                            : row.cleanedZones
                                .map((z) => {
                                  const loc = [z.buildingName, z.floorName, z.zoneName]
                                    .filter(Boolean)
                                    .join(' / ');
                                  return loc;
                                })
                                .join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.pages > 1 ? (
                <div className="pagination" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1 || loading}
                    onClick={() => void loadReport(page - 1)}
                  >
                    Anterior
                  </button>
                  <span className="pagination-info">
                    Página {page} de {report.pages} · {report.total} fila
                    {report.total === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page >= report.pages || loading}
                    onClick={() => void loadReport(page + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
            </>
          )
        ) : (
          <p className="muted">Elegí el rango de fechas para ver el reporte.</p>
        )}
      </div>
    </>
  );
}
