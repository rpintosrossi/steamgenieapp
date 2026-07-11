'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_MODULES } from '@steam-genie/shared-constants';
import { WorkOrderFinanceModal } from '../../../../components/WorkOrderFinanceModal';
import { api } from '../../../../lib/api-client';
import { hasModule } from '../../../../lib/auth';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import {
  ASSIGNMENT_STATUS_LABELS,
  ROLE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_TYPE_LABELS,
} from '../../../../lib/labels';
import {
  calendarDateKeyFromStored,
  formatStoredCalendarDate,
} from '@steam-genie/shared-constants';
import type {
  AssignableCleanerItem,
  AssignableCleanerSameDayService,
  AssignableCleanersResponse,
  Paginated,
  WorkOrderListItem,
} from '../../../../lib/types';

const ASSIGNABLE_STATUSES = new Set(['UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'REJECTED']);
const PAGE_SIZE = 20;
type ScheduleSortDir = 'asc' | 'desc';

function formatDate(value: string | null): string {
  return formatStoredCalendarDate(value, 'es-AR');
}

function formatScheduledTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatAssignments(wo: WorkOrderListItem): string {
  const active = getActiveAssignments(wo);
  if (active.length === 0) return '—';

  return active
    .map((a) => {
      const name = a.user?.fullName ?? a.userId.slice(0, 8);
      const status = ASSIGNMENT_STATUS_LABELS[a.status] ?? a.status;
      return `${name} (${status})`;
    })
    .join(', ');
}

function getActiveAssignments(wo: WorkOrderListItem) {
  return wo.assignments.filter((a) => a.status === 'PENDING' || a.status === 'ACCEPTED');
}

function formatSameDaySchedule(services: AssignableCleanerSameDayService[]): string {
  return services
    .map((service) => {
      const time = service.scheduledTime ?? 'Sin horario';
      const place = service.zoneName ?? service.title;
      return `${time} · ${place}`;
    })
    .join(' · ');
}

function formatPriorRejectionLabel(priorRejection: AssignableCleanerItem['priorRejection']): string {
  if (!priorRejection) return '';
  if (priorRejection.reason) {
    return `Rechazó este servicio antes — ${priorRejection.reason}`;
  }
  return 'Rechazó este servicio antes';
}

function buildPriorRejectionAssignWarning(
  cleaners: AssignableCleanerItem[],
  selectedIds: string[],
): string | null {
  const lines = cleaners
    .filter((cleaner) => selectedIds.includes(cleaner.id) && cleaner.priorRejection)
    .map((cleaner) => {
      const reason = cleaner.priorRejection?.reason;
      if (reason) {
        return `• ${cleaner.fullName} ya tuvo asignado este servicio y lo rechazó (motivo: ${reason}).`;
      }
      return `• ${cleaner.fullName} ya tuvo asignado este servicio y lo rechazó.`;
    });

  if (lines.length === 0) return null;
  return `${lines.join('\n')}\n\n¿Querés asignarlo igualmente?`;
}

const NON_DELETABLE_STATUSES = new Set(['IN_PROGRESS', 'COMPLETED']);

function CleanerAssignOption({
  cleaner,
  isAssigned,
  isSelected,
  onToggle,
}: {
  cleaner: AssignableCleanerItem;
  isAssigned: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`checkbox-item${cleaner.recommended ? ' checkbox-item-recommended' : ''}${
        cleaner.priorRejection ? ' checkbox-item-prior-rejection' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={isAssigned || isSelected}
        disabled={isAssigned}
        onChange={onToggle}
      />
      <span className="checkbox-item-body">
        <span className="checkbox-item-title">
          {cleaner.fullName}
          <span className="muted"> ({cleaner.dni})</span>
          {cleaner.recommended ? (
            <span className="badge badge-primary" style={{ marginLeft: 8 }}>
              Recomendado
            </span>
          ) : null}
          {cleaner.priorRejection ? (
            <span className="badge badge-warning" style={{ marginLeft: 8 }}>
              Rechazó antes
            </span>
          ) : null}
          {isAssigned ? <span className="muted"> — ya asignado</span> : null}
        </span>
        {cleaner.priorRejection ? (
          <span className="checkbox-item-meta checkbox-item-meta-warning">
            {formatPriorRejectionLabel(cleaner.priorRejection)}
          </span>
        ) : null}
        {cleaner.recommended && cleaner.sameDayServices.length > 0 ? (
          <span className="checkbox-item-meta muted">
            {formatSameDaySchedule(cleaner.sameDayServices)}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function EventualServicesPage() {
  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [buildingFilter, setBuildingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortDir, setSortDir] = useState<ScheduleSortDir>('asc');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [assigningWo, setAssigningWo] = useState<WorkOrderListItem | null>(null);
  const [cleaners, setCleaners] = useState<AssignableCleanersResponse['cleaners']>([]);
  const [buildingUsersWrongRole, setBuildingUsersWrongRole] = useState<
    AssignableCleanersResponse['otherUsersOnBuilding']
  >([]);
  const [selectedCleanerIds, setSelectedCleanerIds] = useState<string[]>([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);

  const [deletingWo, setDeletingWo] = useState<WorkOrderListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [financeWoId, setFinanceWoId] = useState<string | null>(null);
  const canManageFinance = hasModule(APP_MODULES.GASTOS_SERVICIOS);

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
      params.set('sortDir', sortDir);

      const res = await api.get<Paginated<WorkOrderListItem>>(`/work-orders?${params}`);
      setItems(res.data);
      setTotal(res.total);
      setPages(Math.max(1, res.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  }, [buildingFilter, statusFilter, sortDir, page]);

  useEffect(() => {
    void fetchBuildingsList()
      .then(setBuildings)
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

  const recommendedCleaners = useMemo(
    () => cleaners.filter((cleaner) => cleaner.recommended),
    [cleaners],
  );

  async function openAssign(wo: WorkOrderListItem) {
    setAssigningWo(wo);
    setSelectedCleanerIds([]);
    setBuildingUsersWrongRole([]);
    setLoadingAssign(true);
    setError(null);
    setSuccess(null);
    try {
      const params = new URLSearchParams({ excludeWorkOrderId: wo.id });
      const scheduledDateKey = calendarDateKeyFromStored(wo.scheduledDate);
      if (scheduledDateKey) params.set('scheduledDate', scheduledDateKey);

      const res = await api.get<AssignableCleanersResponse>(
        `/buildings/${wo.buildingId}/assignable-cleaners?${params}`,
      );
      setCleaners(res.cleaners);
      setBuildingUsersWrongRole(res.otherUsersOnBuilding);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los limpiadores');
      setCleaners([]);
      setBuildingUsersWrongRole([]);
    } finally {
      setLoadingAssign(false);
    }
  }

  function closeAssign() {
    setAssigningWo(null);
    setCleaners([]);
    setBuildingUsersWrongRole([]);
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

    const priorRejectionWarning = buildPriorRejectionAssignWarning(cleaners, selectedCleanerIds);
    if (priorRejectionWarning && !window.confirm(priorRejectionWarning)) {
      return;
    }

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

  function openDelete(wo: WorkOrderListItem) {
    setDeletingWo(wo);
    setError(null);
    setSuccess(null);
  }

  function closeDelete() {
    setDeletingWo(null);
  }

  async function handleDelete() {
    if (!deletingWo) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/work-orders/${deletingWo.id}`);
      setSuccess('Servicio eliminado.');
      closeDelete();
      await loadServices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el servicio');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/trabajos-eventuales" className="back-link">
            ← Trabajos eventuales
          </Link>
          <h1 className="page-title">Servicios</h1>
          <p className="page-subtitle">
            Servicios checkout generados por reservas o creados manualmente. Asigná limpiadores desde
            acá.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Cada servicio incluye las tareas eventuales de la zona. Asigná uno o más limpiadores; ellos
          recibirán el pedido en la app móvil y deberán aceptarlo.
        </p>

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
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(WORK_ORDER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Orden (fecha y hora)</label>
            <select
              value={sortDir}
              onChange={(e) => {
                setSortDir(e.target.value as ScheduleSortDir);
                setPage(1);
              }}
            >
              <option value="asc">Ascendente — más antiguos primero</option>
              <option value="desc">Descendente — más recientes primero</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando servicios…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">
            No hay servicios. Creá una{' '}
            <Link href="/trabajos-eventuales/reservas">reserva</Link> o un{' '}
            <Link href="/trabajos-eventuales">trabajo eventual</Link> manual.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Edificio</th>
                  <th>Zona</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Tareas</th>
                  <th>Estado</th>
                  <th>Asignados</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((wo) => {
                  const canAssign = ASSIGNABLE_STATUSES.has(wo.status);
                  const canDelete = !NON_DELETABLE_STATUSES.has(wo.status);
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
                      <td>{formatScheduledTime(wo.scheduledTime)}</td>
                      <td>{wo._count.workOrderTasks}</td>
                      <td>
                        <span className="badge">
                          {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
                        </span>
                      </td>
                      <td>{formatAssignments(wo)}</td>
                      <td>
                        <div className="table-row-actions">
                          {canManageFinance ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setFinanceWoId(wo.id)}
                              title="Gastos y monto cobrado"
                            >
                              Gastos
                            </button>
                          ) : null}
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
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={!canDelete}
                            onClick={() => openDelete(wo)}
                            title={
                              canDelete
                                ? 'Eliminar servicio'
                                : 'No se puede eliminar un servicio en curso o completado'
                            }
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
              Página {page} de {pages} · {total} servicio{total === 1 ? '' : 's'}
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
              <div className="stack" style={{ gap: 8 }}>
                <p className="muted">
                  No hay limpiadores activos con rol <strong>Limpiador</strong> en este edificio.
                  En Usuarios, editá cada persona y asignale rol Limpiador + el edificio correspondiente
                  (no alcanza con Administrador o Encargado).
                </p>
                {buildingUsersWrongRole.length > 0 ? (
                  <div className="alert alert-info">
                    Usuarios activos en este edificio con otro rol:{' '}
                    {buildingUsersWrongRole
                      .map(
                        (user) =>
                          `${user.fullName} (${ROLE_LABELS[user.primaryRole] ?? user.primaryRole})`,
                      )
                      .join(', ')}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {recommendedCleaners.length > 0 ? (
                  <div className="alert alert-info" style={{ marginBottom: 12 }}>
                    {recommendedCleaners.length === 1
                      ? '1 limpiador ya tiene servicios este día en el edificio.'
                      : `${recommendedCleaners.length} limpiadores ya tienen servicios este día en el edificio.`}
                  </div>
                ) : null}

                <div className="checkbox-grid">
                  {cleaners.map((cleaner) => (
                    <CleanerAssignOption
                      key={cleaner.id}
                      cleaner={cleaner}
                      isAssigned={alreadyAssignedIds.has(cleaner.id)}
                      isSelected={selectedCleanerIds.includes(cleaner.id)}
                      onToggle={() => toggleCleaner(cleaner.id)}
                    />
                  ))}
                </div>
              </>
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

      {deletingWo ? (
        <div className="modal-overlay" onClick={closeDelete}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Eliminar servicio</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeDelete}>
                Cerrar
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0 }}>
              ¿Eliminar el servicio <strong>{deletingWo.title}</strong>?
            </p>

            {getActiveAssignments(deletingWo).length > 0 ? (
              <div className="alert alert-warning">
                Este servicio está asignado a: <strong>{formatAssignments(deletingWo)}</strong>.
                Al eliminarlo, dejarán de verlo en la app móvil.
              </div>
            ) : (
              <p className="muted">Esta acción no se puede deshacer.</p>
            )}

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeDelete}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {financeWoId ? (
        <WorkOrderFinanceModal workOrderId={financeWoId} onClose={() => setFinanceWoId(null)} />
      ) : null}
    </>
  );
}
