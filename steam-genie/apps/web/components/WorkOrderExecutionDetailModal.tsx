'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import {
  TASK_EXECUTION_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_TYPE_LABELS,
} from '../lib/labels';
import { formatStoredCalendarDate, buildClientPdfFilename } from '@steam-genie/shared-constants';
import type {
  PhotoEvidenceMode,
  ServiceExecutionPhasePhoto,
  ServiceExecutionTaskItem,
  WorkOrderDetail,
} from '../lib/types';
import type { TaskPhotoGalleryItem } from './TaskPhotoLightbox';
import { TaskPhotoThumb } from './TaskPhotoThumb';
import { WorkOrderChecklistModal } from './WorkOrderChecklistModal';

function buildServiceReportFilename(wo: WorkOrderDetail): string {
  const clientName = wo.building?.name ?? 'Cliente';
  const dateKey =
    formatStoredCalendarDate(wo.scheduledDate, 'en-CA') !== '—'
      ? formatStoredCalendarDate(wo.scheduledDate, 'en-CA').replace(/-/g, '')
      : wo.id.slice(0, 8);
  return buildClientPdfFilename(clientName, dateKey);
}

type Props = {
  workOrderId: string;
  onClose: () => void;
  onChecklistSaved?: () => void;
};

const PHASE_LABELS: Record<string, string> = {
  BEFORE: 'Antes',
  DURING: 'Durante',
  AFTER: 'Después',
};

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

function formatScheduledTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function resolvePhotoEvidenceMode(
  building: WorkOrderDetail['building'],
): PhotoEvidenceMode {
  if (
    building?.buildingMode === 'SIMPLE' &&
    building.photoEvidenceMode === 'BEFORE_DURING_AFTER'
  ) {
    return 'BEFORE_DURING_AFTER';
  }
  return 'PER_TASK';
}

function formatMoney(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function formatQty(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value ?? '—');
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-AR');
}

function photoRequirementLabel(requiresPhoto: boolean, allowsPhoto?: boolean): string {
  if (requiresPhoto) return 'Foto obligatoria';
  if (allowsPhoto) return 'Foto opcional';
  return 'Sin foto';
}

export function WorkOrderExecutionDetailModal({ workOrderId, onClose, onChecklistSaved }: Props) {
  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [tasks, setTasks] = useState<ServiceExecutionTaskItem[]>([]);
  const [phasePhotos, setPhasePhotos] = useState<ServiceExecutionPhasePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [editingChecklist, setEditingChecklist] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.get<WorkOrderDetail>(`/work-orders/${workOrderId}`);
      setWo(detail);

      const se = detail.serviceExecutions?.[0];
      if (!se) {
        setTasks([]);
        setPhasePhotos([]);
        return;
      }

      const [taskItems, phases] = await Promise.all([
        api.get<ServiceExecutionTaskItem[]>(`/service-executions/${se.id}/tasks`),
        api.get<ServiceExecutionPhasePhoto[]>(
          `/service-executions/${se.id}/phase-photos`,
        ),
      ]);

      setTasks(taskItems);
      setPhasePhotos(phases);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle');
      setWo(null);
      setTasks([]);
      setPhasePhotos([]);
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDownloadPdf() {
    if (!wo) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      await api.download(
        `/work-orders/${workOrderId}/service-report`,
        buildServiceReportFilename(wo),
      );
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'No se pudo descargar el PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }

  const isBdaMode = resolvePhotoEvidenceMode(wo?.building) === 'BEFORE_DURING_AFTER';
  const showPhaseSection = isBdaMode || phasePhotos.length > 0;
  const se = wo?.serviceExecutions?.[0] ?? null;
  const participants =
    se?.participants
      .map((p) => p.user?.fullName)
      .filter((name): name is string => Boolean(name)) ?? [];

  const serviceGallery = useMemo((): TaskPhotoGalleryItem[] => {
    if (!wo) return [];

    const location = {
      buildingName: wo.building?.name ?? null,
      floor: wo.floor ?? null,
      zone: wo.zone ?? null,
      subzone: wo.subzone ?? null,
    };

    const phaseItems: TaskPhotoGalleryItem[] = phasePhotos.map((photo) => ({
      id: photo.id,
      photoId: photo.id,
      photoUrl: photo.url,
      title: photo.originalFilename ?? PHASE_LABELS[photo.phase] ?? 'Foto de fase',
      context: {
        capturedAt: photo.capturedAt,
        uploadedAt: photo.uploadedAt,
        uploadedByName: photo.uploadedByName ?? participants[0] ?? null,
        taskName: `${wo.title} · ${PHASE_LABELS[photo.phase] ?? photo.phase}`,
        ...location,
      },
    }));

    if (isBdaMode) return phaseItems;

    const taskItems: TaskPhotoGalleryItem[] = [];
    for (const item of tasks) {
      for (const photo of item.execution?.photos ?? []) {
        taskItems.push({
          id: photo.id,
          photoId: photo.id,
          photoUrl: photo.url,
          title: photo.originalFilename ?? item.nameSnapshot,
          context: {
            capturedAt: photo.capturedAt,
            uploadedAt: photo.uploadedAt,
            uploadedByName: item.execution?.executedByName ?? null,
            taskName: item.nameSnapshot,
            ...location,
          },
        });
      }
    }

    return [...phaseItems, ...taskItems];
  }, [wo, phasePhotos, tasks, isBdaMode, participants]);

  const galleryIndexById = useMemo(() => {
    const map = new Map<string, number>();
    serviceGallery.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [serviceGallery]);

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide work-order-execution-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Detalle del servicio</h2>
          <div className="table-row-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={loading || !wo || downloadingPdf}
              onClick={() => void handleDownloadPdf()}
              title="Descargar resumen PDF para el cliente"
            >
              {downloadingPdf ? 'Generando PDF…' : 'Descargar PDF'}
            </button>
            {wo && wo.status !== 'COMPLETED' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingChecklist(true)}
                title="Editar nombre, fotos requeridas y tareas del checklist"
              >
                Editar tareas
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        {pdfError ? <div className="alert alert-error">{pdfError}</div> : null}

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando detalle…</p>
          </div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : !wo ? (
          <p className="muted">No se encontró el servicio.</p>
        ) : (
          <div className="stack" style={{ gap: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{wo.title}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {WORK_ORDER_TYPE_LABELS[wo.type] ?? wo.type}
                {' · '}
                {wo.building?.name ?? 'Edificio'}
                {wo.zone?.name ? ` · ${wo.zone.name}` : ''}
                {wo.subzone?.name ? ` · ${wo.subzone.name}` : ''}
              </p>
            </div>

            <dl className="recurring-task-card-meta">
              <div className="recurring-task-meta-item">
                <dt>Estado</dt>
                <dd>
                  <span className="badge">
                    {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
                  </span>
                </dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Fecha programada</dt>
                <dd>{formatStoredCalendarDate(wo.scheduledDate, 'es-AR')}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Hora programada</dt>
                <dd>{formatScheduledTime(wo.scheduledTime)}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Inicio</dt>
                <dd>{formatDateTime(se?.startedAt)}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Finalización</dt>
                <dd>{formatDateTime(se?.completedAt ?? wo.completedAt)}</dd>
              </div>
              <div className="recurring-task-meta-item">
                <dt>Limpiadores en el servicio</dt>
                <dd>{participants.length > 0 ? participants.join(', ') : '—'}</dd>
              </div>
              {wo.quote ? (
                <div className="recurring-task-meta-item">
                  <dt>Presupuesto</dt>
                  <dd>
                    <Link href={`/presupuestos/${wo.quote.id}`} className="btn-link">
                      #{wo.quote.number}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>

            {wo.quote ? (
              <section className="stack" style={{ gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <h4 className="recurring-task-list-heading" style={{ margin: 0 }}>
                    {wo.quote.items.length > 0
                      ? `Ítems del presupuesto #${wo.quote.number}`
                      : `Presupuesto #${wo.quote.number}`}
                  </h4>
                  <Link
                    href={`/presupuestos/${wo.quote.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Abrir presupuesto
                  </Link>
                </div>
                {wo.quote.items.length > 0 ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Cant.</th>
                          <th>Descripción</th>
                          <th>Precio</th>
                          <th>% Bonif.</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wo.quote.items.map((item) => (
                          <tr key={item.id}>
                            <td>{formatQty(item.quantity)}</td>
                            <td>{item.description}</td>
                            <td>{formatMoney(item.unitPrice)}</td>
                            <td>
                              {item.discountPercent != null && item.discountPercent !== ''
                                ? formatQty(item.discountPercent)
                                : '—'}
                            </td>
                            <td>{formatMoney(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    Este presupuesto no tiene ítems cargados.
                  </p>
                )}
              </section>
            ) : null}

            {!se ? (
              <p className="muted" style={{ margin: 0 }}>
                Este servicio todavía no tiene una ejecución iniciada.
              </p>
            ) : showPhaseSection ? (
              <section className="stack" style={{ gap: 10 }}>
                <h4 className="recurring-task-list-heading" style={{ margin: 0 }}>
                  Fotos del servicio (antes / durante / después)
                </h4>
                {phasePhotos.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Sin fotos de fase
                  </p>
                ) : (
                  <div className="stack" style={{ gap: 12 }}>
                    {(['BEFORE', 'DURING', 'AFTER'] as const).map((phase) => {
                      const phaseItems = phasePhotos.filter((p) => p.phase === phase);
                      if (phaseItems.length === 0) return null;
                      return (
                        <div key={phase}>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                            {PHASE_LABELS[phase]}
                          </div>
                          <div className="photo-thumbs">
                            {phaseItems.map((photo) => (
                              <TaskPhotoThumb
                                key={photo.id}
                                photoId={photo.id}
                                photoUrl={photo.url}
                                title={photo.originalFilename ?? PHASE_LABELS[phase]}
                                gallery={serviceGallery}
                                galleryIndex={galleryIndexById.get(photo.id) ?? 0}
                                context={{
                                  capturedAt: photo.capturedAt,
                                  uploadedAt: photo.uploadedAt,
                                  uploadedByName:
                                    photo.uploadedByName ?? participants[0] ?? null,
                                  taskName: wo.title,
                                  buildingName: wo.building?.name ?? null,
                                  floor: wo.floor ?? null,
                                  zone: wo.zone ?? null,
                                  subzone: wo.subzone ?? null,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            <section className="stack" style={{ gap: 12 }}>
              <p className="recurring-task-list-heading" style={{ margin: 0 }}>
                {se
                  ? `${tasks.length} tarea${tasks.length === 1 ? '' : 's'}`
                  : `${wo.workOrderTasks?.length ?? 0} tarea${
                      (wo.workOrderTasks?.length ?? 0) === 1 ? '' : 's'
                    }`}
              </p>

              {se ? (
                tasks.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No hay tareas en este servicio.
                  </p>
                ) : (
                  tasks.map((item) => {
                    const photos = item.execution?.photos ?? [];
                    const photoPending =
                      !isBdaMode &&
                      item.requiresPhotoSnapshot &&
                      item.execution?.status === 'DONE' &&
                      photos.length === 0;

                    return (
                      <article key={item.workOrderTaskId} className="recurring-task-card">
                        <div className="recurring-task-card-header">
                          <h3 className="recurring-task-card-title">{item.nameSnapshot}</h3>
                          <span className="badge">
                            {item.execution
                              ? (TASK_EXECUTION_STATUS_LABELS[item.execution.status] ??
                                item.execution.status)
                              : 'Pendiente'}
                          </span>
                        </div>

                        <dl className="recurring-task-card-meta">
                          <div className="recurring-task-meta-item">
                            <dt>Completado por</dt>
                            <dd>{item.execution?.executedByName ?? '—'}</dd>
                          </div>
                          <div className="recurring-task-meta-item">
                            <dt>Fecha y hora</dt>
                            <dd>{formatDateTime(item.execution?.executedAt)}</dd>
                          </div>
                          <div className="recurring-task-meta-item recurring-task-meta-item--full">
                            <dt>Observación</dt>
                            <dd>
                              {item.execution?.observation?.trim()
                                ? item.execution.observation
                                : '—'}
                            </dd>
                          </div>
                          {!isBdaMode ? (
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
                                        gallery={serviceGallery}
                                        galleryIndex={galleryIndexById.get(photo.id) ?? 0}
                                        context={{
                                          capturedAt: photo.capturedAt,
                                          uploadedAt: photo.uploadedAt,
                                          uploadedByName:
                                            item.execution?.executedByName ?? null,
                                          taskName: item.nameSnapshot,
                                          buildingName: wo.building?.name ?? null,
                                          floor: wo.floor ?? null,
                                          zone: wo.zone ?? null,
                                          subzone: wo.subzone ?? null,
                                        }}
                                      />
                                    ))}
                                  </div>
                                ) : photoPending ? (
                                  <span className="badge badge-warning">
                                    Realizada con foto pendiente
                                  </span>
                                ) : item.execution ? (
                                  <span className="muted">Sin fotos</span>
                                ) : (
                                  <span className="muted">
                                    {photoRequirementLabel(
                                      item.requiresPhotoSnapshot,
                                      item.allowsPhotoSnapshot,
                                    )}
                                  </span>
                                )}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </article>
                    );
                  })
                )
              ) : (wo.workOrderTasks ?? []).length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No hay tareas en este servicio. Usá «Editar tareas» para agregarlas.
                </p>
              ) : (
                (wo.workOrderTasks ?? []).map((item) => (
                  <article key={item.id} className="recurring-task-card">
                    <div className="recurring-task-card-header">
                      <h3 className="recurring-task-card-title">{item.nameSnapshot}</h3>
                      <span className="badge">Pendiente</span>
                    </div>
                    {!isBdaMode ? (
                      <dl className="recurring-task-card-meta">
                        <div className="recurring-task-meta-item">
                          <dt>Foto</dt>
                          <dd>
                            {photoRequirementLabel(
                              item.requiresPhotoSnapshot,
                              item.allowsPhotoSnapshot,
                            )}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </article>
                ))
              )}
            </section>
          </div>
        )}
      </div>
    </div>
    {editingChecklist ? (
      <WorkOrderChecklistModal
        workOrderId={workOrderId}
        onClose={() => setEditingChecklist(false)}
        onSaved={() => {
          void load();
          onChecklistSaved?.();
        }}
      />
    ) : null}
  </>
  );
}
