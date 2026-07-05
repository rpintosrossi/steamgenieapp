'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { APP_MODULES } from '@steam-genie/shared-constants';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import { hasModule } from '../../../../lib/auth';
import {
  RECURRING_WORK_STATUS_LABELS,
  TASK_EXECUTION_STATUS_LABELS,
  TASK_FREQUENCY_LABELS,
} from '../../../../lib/labels';
import {
  RECURRING_WORK_GROUP_STATUS_BADGE,
  RECURRING_WORK_GROUP_STATUS_LABELS,
} from '../../../../lib/recurring-work-groups';
import type {
  Paginated,
  RecurringWorkGroupSummary,
  RecurringWorkListItem,
} from '../../../../lib/types';
import { LocationDisplay } from '../../../../components/LocationDisplay';
import { TaskPhotoThumb } from '../../../../components/TaskPhotoThumb';

const GROUP_PAGE_SIZE = 20;
const TASK_PAGE_SIZE = 20;

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

function formatPeriodDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  COMPLETED: 'badge-success',
  SCHEDULED: 'badge-info',
  OVERDUE: 'badge-warning',
};

function RecurringTaskDetailList({ tasks }: { tasks: RecurringWorkListItem[] }) {
  return (
    <div className="recurring-task-list">
      <p className="recurring-task-list-heading">
        {tasks.length} tarea{tasks.length === 1 ? '' : 's'} en esta ubicación
      </p>
      {tasks.map((item) => {
        const photos = item.execution?.photos ?? [];
        const photoPending =
          item.requiresPhoto &&
          item.execution?.status === 'DONE' &&
          photos.length === 0;

        return (
          <article key={item.id} className="recurring-task-card">
            <div className="recurring-task-card-header">
              <h3 className="recurring-task-card-title">{item.taskName}</h3>
              <span className={`badge ${STATUS_BADGE_CLASS[item.displayStatus] ?? ''}`}>
                {RECURRING_WORK_STATUS_LABELS[item.displayStatus] ?? item.displayStatus}
              </span>
            </div>

            <dl className="recurring-task-card-meta">
              <div className="recurring-task-meta-item">
                <dt>Frecuencia</dt>
                <dd>{TASK_FREQUENCY_LABELS[item.frequency] ?? item.frequency}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Período</dt>
                <dd>{item.periodLabelDisplay}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Completado por</dt>
                <dd>{item.execution?.executedBy.fullName ?? '—'}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Fecha y hora</dt>
                <dd>{formatDateTime(item.execution?.executedAt ?? item.completedAt)}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Resultado</dt>
                <dd>
                  {item.execution
                    ? (TASK_EXECUTION_STATUS_LABELS[item.execution.status] ?? item.execution.status)
                    : '—'}
                </dd>
              </div>
              <div className="recurring-task-meta-item recurring-task-meta-item--full">
                <dt>Evidencia fotográfica</dt>
                <dd>
                  {photos.length > 0 ? (
                    <div className="photo-thumbs">
                      {photos.map((photo) => (
                        <TaskPhotoThumb
                          key={photo.id}
                          photoId={photo.id}
                          photoUrl={photo.url}
                          title={photo.originalFilename ?? 'Ver foto'}
                          context={{
                            capturedAt: photo.capturedAt,
                            uploadedAt: photo.uploadedAt,
                            uploadedByName:
                              photo.uploadedBy?.fullName ??
                              item.execution?.executedBy.fullName ??
                              null,
                            taskName: item.taskName,
                            buildingName: item.building?.name ?? null,
                            floor: item.floor,
                            zone: item.zone,
                            subzone: item.subzone,
                          }}
                        />
                      ))}
                    </div>
                  ) : photoPending ? (
                    <span className="badge badge-warning">Realizada con foto pendiente</span>
                  ) : item.execution ? (
                    <span className="muted">Sin fotos</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function RecurringGroupDetail({
  group,
  periodDate,
  search,
}: {
  group: RecurringWorkGroupSummary;
  periodDate: string;
  search: string;
}) {
  const [tasks, setTasks] = useState<RecurringWorkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskPage, setTaskPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!group.floorId || !group.zoneId) {
      setTasks([]);
      setLoading(false);
      setError('Ubicación incompleta para cargar tareas.');
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      buildingId: group.buildingId,
      floorId: group.floorId,
      zoneId: group.zoneId,
      periodDate,
      page: String(taskPage),
      limit: String(TASK_PAGE_SIZE),
    });
    if (group.subzoneId) params.set('subzoneId', group.subzoneId);
    if (search.trim()) params.set('search', search.trim());

    void api
      .get<Paginated<RecurringWorkListItem>>(`/tasks/recurring-work/group-tasks?${params}`)
      .then((res) => {
        setTasks(res.data);
        setTotalPages(res.pages);
        setTotal(res.total);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Error al cargar tareas');
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [group.key, group.buildingId, group.floorId, group.zoneId, group.subzoneId, periodDate, search, taskPage]);

  if (loading) {
    return (
      <div className="loading-state" style={{ padding: '12px 0' }}>
        <div className="spinner" role="status" aria-label="Cargando tareas" />
        <p className="muted">Cargando tareas…</p>
      </div>
    );
  }

  if (error) {
    return <p className="muted">{error}</p>;
  }

  if (tasks.length === 0) {
    return <p className="muted">No hay tareas en esta ubicación.</p>;
  }

  return (
    <>
      <RecurringTaskDetailList tasks={tasks} />
      {totalPages > 1 ? (
        <div className="pagination" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={taskPage <= 1}
            onClick={() => setTaskPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="pagination-info">
            Página {taskPage} de {totalPages} · {total} tarea{total === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={taskPage >= totalPages}
            onClick={() => setTaskPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function RecurringWorkListPage() {
  const readOnly = hasModule(APP_MODULES.TRABAJOS_RECURRENTES) && !hasModule(APP_MODULES.BUILDINGS);
  const [groups, setGroups] = useState<RecurringWorkGroupSummary[]>([]);
  const [groupTotal, setGroupTotal] = useState(0);
  const [groupPages, setGroupPages] = useState(1);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const [groupPage, setGroupPage] = useState(1);

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
        periodDate,
        page: String(groupPage),
        limit: String(GROUP_PAGE_SIZE),
      });
      if (buildingFilter) params.set('buildingId', buildingFilter);
      if (statusFilter) params.set('groupStatus', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get<Paginated<RecurringWorkGroupSummary>>(
        `/tasks/recurring-work/groups?${params}`,
      );
      setGroups(res.data);
      setGroupTotal(res.total);
      setGroupPages(res.pages);
      setExpandedKeys(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar trabajos recurrentes');
    } finally {
      setLoading(false);
    }
  }, [buildingFilter, groupPage, periodDate, search, statusFilter]);

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
    setSearch(searchInput.trim());
    setGroupPage(1);
  }

  function clearFilters() {
    setBuildingFilter('');
    setStatusFilter('');
    setPeriodDate(todayInputValue());
    setSearchInput('');
    setSearch('');
    setGroupPage(1);
  }

  function toggleGroup(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasFilters = Boolean(buildingFilter || statusFilter || search || periodDate !== todayInputValue());

  return (
    <>
      <div className="page-header">
        <div>
          <Link
            href={readOnly ? '/dashboard' : '/trabajos-recurrentes'}
            className="back-link"
          >
            {readOnly ? '← Inicio' : '← Trabajos recurrentes'}
          </Link>
          <h1 className="page-title">Listado de Trabajos</h1>
          <p className="page-subtitle">
            {readOnly
              ? 'Tareas agrupadas por ubicación. Abrí cada zona para ver el detalle de sus tareas.'
              : 'Tareas periódicas agrupadas por zona o subzona. Abrí cada ubicación para ver el detalle.'}
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
                setBuildingFilter(e.target.value);
                setGroupPage(1);
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
            <label>Estado general</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setGroupPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="COMPLETED">Completado</option>
              <option value="PARTIAL">En curso</option>
              <option value="SCHEDULED">Programado</option>
              <option value="OVERDUE">Vencido</option>
            </select>
          </div>
          <div className="form-field">
            <label>Fecha de referencia (período)</label>
            <input
              type="date"
              value={periodDate}
              onChange={(e) => {
                setPeriodDate(e.target.value);
                setGroupPage(1);
              }}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando trabajos…</p>
          </div>
        ) : groups.length === 0 ? (
          <p className="muted">No hay trabajos recurrentes con los filtros seleccionados.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Ubicación</th>
                    <th>Edificio</th>
                    <th>Período</th>
                    <th>Estado general</th>
                    <th>Tareas</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const isExpanded = expandedKeys.has(group.key);
                    return (
                      <GroupRows
                        key={group.key}
                        group={group}
                        isExpanded={isExpanded}
                        onToggle={() => toggleGroup(group.key)}
                        periodDateLabel={formatPeriodDate(periodDate)}
                        periodDate={periodDate}
                        search={search}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={groupPage <= 1}
                onClick={() => setGroupPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="pagination-info">
                Página {groupPage} de {groupPages} · {groupTotal} ubicación
                {groupTotal === 1 ? '' : 'es'}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={groupPage >= groupPages}
                onClick={() => setGroupPage((p) => Math.min(groupPages, p + 1))}
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

function GroupRows({
  group,
  isExpanded,
  onToggle,
  periodDateLabel,
  periodDate,
  search,
}: {
  group: RecurringWorkGroupSummary;
  isExpanded: boolean;
  onToggle: () => void;
  periodDateLabel: string;
  periodDate: string;
  search: string;
}) {
  return (
    <>
      <tr
        className={`recurring-group-row ${isExpanded ? 'is-expanded' : ''}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
      >
        <td>
          <span className="recurring-group-toggle" aria-hidden>
            ›
          </span>
        </td>
        <td>
          <LocationDisplay floor={group.floor} zone={group.zone} subzone={group.subzone} />
        </td>
        <td>{group.building?.name ?? '—'}</td>
        <td>{group.periodLabelDisplay || periodDateLabel}</td>
        <td>
          <span
            className={`badge ${RECURRING_WORK_GROUP_STATUS_BADGE[group.aggregateStatus] ?? ''}`}
          >
            {RECURRING_WORK_GROUP_STATUS_LABELS[group.aggregateStatus]}
          </span>
        </td>
        <td>
          {group.taskCount} tarea{group.taskCount === 1 ? '' : 's'}
        </td>
      </tr>
      {isExpanded ? (
        <tr className="recurring-group-detail">
          <td colSpan={6}>
            <div className="recurring-group-detail-inner">
              <RecurringGroupDetail group={group} periodDate={periodDate} search={search} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
