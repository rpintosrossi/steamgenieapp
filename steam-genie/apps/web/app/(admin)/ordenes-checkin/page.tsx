'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import { fetchBuildingsList } from '../../../lib/buildings-cache';
import {
  ASSIGNMENT_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_TYPE_LABELS,
} from '../../../lib/labels';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import type { Paginated, WorkOrderListItem } from '../../../lib/types';

const VIEWABLE_STATUSES = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] as const;
const PAGE_SIZE = 20;

function formatDate(value: string | null): string {
  return formatStoredCalendarDate(value, 'es-AR');
}

function formatAssignments(wo: WorkOrderListItem): string {
  const active = wo.assignments.filter((a) => a.status === 'PENDING' || a.status === 'ACCEPTED');
  if (active.length === 0) return '—';

  return active
    .map((a) => {
      const name = a.user?.fullName ?? a.userId.slice(0, 8);
      const status = ASSIGNMENT_STATUS_LABELS[a.status] ?? a.status;
      return `${name} (${status})`;
    })
    .join(', ');
}

export default function OrdenesCheckinPage() {
  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buildingFilter, setBuildingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(page),
        type: 'CHECKOUT_CLEANING',
      });
      if (buildingFilter) params.set('buildingId', buildingFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await api.get<Paginated<WorkOrderListItem>>(`/work-orders?${params}`);
      setItems(res.data);
      setTotal(res.total);
      setPages(Math.max(1, res.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  }, [buildingFilter, statusFilter, page]);

  useEffect(() => {
    void fetchBuildingsList()
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes check-in / check-out</h1>
          <p className="page-subtitle">
            Servicios aceptados, en curso o completados. Solo consulta, sin permisos de modificación.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label>Edificio</label>
            <select
              value={buildingFilter}
              onChange={(e) => {
                setBuildingFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los habilitados</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos (aceptado, en curso, completado)</option>
              {VIEWABLE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {WORK_ORDER_STATUS_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando órdenes…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">No hay órdenes de trabajo en los estados consultables.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Edificio</th>
                  <th>Zona</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Asignados</th>
                </tr>
              </thead>
              <tbody>
                {items.map((wo) => (
                  <tr key={wo.id}>
                    <td>
                      <div>{wo.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {WORK_ORDER_TYPE_LABELS[wo.type] ?? wo.type}
                      </div>
                    </td>
                    <td>{wo.building?.name ?? '—'}</td>
                    <td>{wo.zone?.name ?? '—'}</td>
                    <td>{formatDate(wo.scheduledDate)}</td>
                    <td>
                      <span className="badge">
                        {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
                      </span>
                    </td>
                    <td>{formatAssignments(wo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length > 0 ? (
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
              Página {page} de {pages} · {total} orden{total === 1 ? '' : 'es'}
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
        ) : null}
      </div>
    </>
  );
}
