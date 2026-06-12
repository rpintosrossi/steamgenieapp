'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api-client';
import {
  ASSIGNMENT_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_TYPE_LABELS,
} from '../../../lib/labels';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import type { Paginated, UserItem, WorkOrderListItem } from '../../../lib/types';

const ASSIGNABLE_STATUSES = new Set(['UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'REJECTED']);

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

export default function ServicesPage() {
  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [buildingFilter, setBuildingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [assigningWo, setAssigningWo] = useState<WorkOrderListItem | null>(null);
  const [cleaners, setCleaners] = useState<UserItem[]>([]);
  const [selectedCleanerIds, setSelectedCleanerIds] = useState<string[]>([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100', type: 'CHECKOUT_CLEANING' });
      if (buildingFilter) params.set('buildingId', buildingFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await api.get<Paginated<WorkOrderListItem>>(`/work-orders?${params}`);
      setItems(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  }, [buildingFilter, statusFilter]);

  useEffect(() => {
    void api
      .get<{ data: Array<{ id: string; name: string }> }>('/buildings?limit=100')
      .then((res) => setBuildings(res.data))
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const alreadyAssignedIds = useMemo(() => {
    if (!assigningWo) return new Set<string>();
    return new Set(
      assigningWo.assignments
        .filter((a) => a.status === 'PENDING' || a.status === 'ACCEPTED')
        .map((a) => a.userId),
    );
  }, [assigningWo]);

  async function openAssign(wo: WorkOrderListItem) {
    setAssigningWo(wo);
    setSelectedCleanerIds([]);
    setLoadingAssign(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.get<Paginated<UserItem>>(
        `/users?role=cleaner&buildingId=${wo.buildingId}&isActive=true&limit=100`,
      );
      setCleaners(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los limpiadores');
      setCleaners([]);
    } finally {
      setLoadingAssign(false);
    }
  }

  function closeAssign() {
    setAssigningWo(null);
    setCleaners([]);
    setSelectedCleanerIds([]);
  }

  function toggleCleaner(userId: string) {
    if (alreadyAssignedIds.has(userId)) return;
    setSelectedCleanerIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function handleAssign() {
    if (!assigningWo || selectedCleanerIds.length === 0) return;

    setSavingAssign(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/work-orders/${assigningWo.id}/assign`, { userIds: selectedCleanerIds });
      setSuccess('Limpiadores asignados. Deberán aceptar el servicio en la app móvil.');
      closeAssign();
      await loadServices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar el servicio');
    } finally {
      setSavingAssign(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Servicios</h1>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Servicios de limpieza checkout generados por reservas. Cada servicio incluye las tareas
          eventuales de la zona. Asigná uno o más limpiadores; ellos recibirán el pedido en la app
          móvil y deberán aceptarlo.
        </p>

        <div className="grid-3" style={{ marginBottom: 16 }}>
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
          <div className="form-field">
            <label>Estado</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(WORK_ORDER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="muted">No hay servicios. Creá una reserva para generar uno.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Edificio</th>
                <th>Zona</th>
                <th>Fecha</th>
                <th>Tareas</th>
                <th>Estado</th>
                <th>Asignados</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((wo) => {
                const canAssign = ASSIGNABLE_STATUSES.has(wo.status);
                return (
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
                    <td>{wo._count.workOrderTasks}</td>
                    <td>
                      <span className="badge">
                        {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
                      </span>
                    </td>
                    <td>{formatAssignments(wo)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!canAssign}
                        onClick={() => void openAssign(wo)}
                        title={
                          canAssign
                            ? 'Asignar limpiadores'
                            : 'No se puede asignar en este estado'
                        }
                      >
                        Asignar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {assigningWo ? (
        <div className="modal-overlay" onClick={closeAssign}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Asignar limpiadores</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeAssign}>
                Cerrar
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0 }}>
              <strong>{assigningWo.title}</strong>
              <br />
              {assigningWo.building?.name ?? 'Edificio'} · {assigningWo.zone?.name ?? 'Zona'} ·{' '}
              {formatDate(assigningWo.scheduledDate)}
            </p>

            {assigningWo.assignments.some(
              (a) => a.status === 'PENDING' || a.status === 'ACCEPTED',
            ) ? (
              <div className="alert alert-info" style={{ marginBottom: 12 }}>
                Ya asignados: {formatAssignments(assigningWo)}
              </div>
            ) : null}

            {loadingAssign ? (
              <p className="muted">Cargando limpiadores…</p>
            ) : cleaners.length === 0 ? (
              <p className="muted">
                No hay limpiadores activos asignados a este edificio. Creá o editá usuarios con rol
                limpiador y edificio correspondiente.
              </p>
            ) : (
              <div className="checkbox-grid">
                {cleaners.map((cleaner) => {
                  const isAssigned = alreadyAssignedIds.has(cleaner.id);
                  const isSelected = selectedCleanerIds.includes(cleaner.id);
                  return (
                    <label key={cleaner.id} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={isAssigned || isSelected}
                        disabled={isAssigned}
                        onChange={() => toggleCleaner(cleaner.id)}
                      />
                      <span>
                        {cleaner.fullName}
                        <span className="muted"> ({cleaner.dni})</span>
                        {isAssigned ? (
                          <span className="muted"> — ya asignado</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingAssign || selectedCleanerIds.length === 0}
                onClick={() => void handleAssign()}
              >
                {savingAssign ? 'Asignando…' : 'Confirmar asignación'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeAssign}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
