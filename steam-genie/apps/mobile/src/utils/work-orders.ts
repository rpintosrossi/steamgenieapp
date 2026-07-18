import { WorkOrderCached } from '../stores/building.store';
import { endOfStoredCalendarDateInBusinessTz, formatStoredCalendarDate } from '@steam-genie/shared-constants';

interface WorkOrdersListResponse {
  data?: WorkOrderCached[];
  total?: number;
}

/** Normaliza la respuesta de GET /work-orders para evitar crashes por campos ausentes. */
export function normalizeWorkOrdersList(response: unknown): WorkOrderCached[] {
  if (!response || typeof response !== 'object') return [];

  const payload = response as WorkOrdersListResponse | WorkOrderCached[];
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : [];

  return items
    .filter((item): item is WorkOrderCached => Boolean(item?.id))
    .map((item) => ({
      ...item,
      workOrderTasks: item.workOrderTasks ?? [],
      assignments: item.assignments ?? [],
    }));
}

export function getWorkOrderTaskCount(item: WorkOrderCached): number {
  return item._count?.workOrderTasks ?? item.workOrderTasks?.length ?? 0;
}

export function getUserAssignment(item: WorkOrderCached, userId: string) {
  const userAssignments = item.assignments?.filter((a) => a.userId === userId) ?? [];
  if (userAssignments.length === 0) return undefined;

  return (
    userAssignments.find((a) => a.status === 'PENDING' || a.status === 'ACCEPTED') ??
    userAssignments.find((a) => a.status === 'REJECTED') ??
    userAssignments[0]
  );
}

/** Solo servicios con asignación PENDING o ACCEPTED para el usuario. */
export function filterWorkOrdersAssignedToUser(
  items: WorkOrderCached[],
  userId: string,
): WorkOrderCached[] {
  return items.filter((wo) => {
    const assignment = getUserAssignment(wo, userId);
    return assignment?.status === 'PENDING' || assignment?.status === 'ACCEPTED';
  });
}

export function sortWorkOrdersByDate(items: WorkOrderCached[]): WorkOrderCached[] {
  return [...items].sort((a, b) => {
    const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

/** Completa assignments desde prefetch cuando la API no los trae (cache offline). */
export function enrichWorkOrdersWithAssignments(
  items: WorkOrderCached[],
  prefetchItems: WorkOrderCached[] | undefined,
): WorkOrderCached[] {
  if (!prefetchItems?.length) return items;

  const assignmentByWoId = new Map(
    prefetchItems.map((wo) => [wo.id, wo.assignments ?? []]),
  );

  return items.map((item) => {
    if (item.assignments?.length) return item;
    const fromPrefetch = assignmentByWoId.get(item.id);
    if (!fromPrefetch?.length) return item;
    return { ...item, assignments: fromPrefetch };
  });
}

const CLOSED_STATUSES = ['COMPLETED', 'REJECTED', 'CANCELLED'];
const EXPIRABLE_STATUSES = ['ASSIGNED', 'ACCEPTED'];

/** Servicio vencido: aún no iniciado y pasó la fecha límite o el día programado. */
export function isWorkOrderExpired(
  wo: Pick<WorkOrderCached, 'status' | 'scheduledDate' | 'deadlineAt'>,
  now: Date = new Date(),
): boolean {
  if (!EXPIRABLE_STATUSES.includes(wo.status)) return false;

  if (wo.deadlineAt) {
    return new Date(wo.deadlineAt).getTime() < now.getTime();
  }

  if (wo.scheduledDate) {
    return endOfStoredCalendarDateInBusinessTz(wo.scheduledDate).getTime() < now.getTime();
  }

  return false;
}

export function excludeExpiredWorkOrders(items: WorkOrderCached[]): WorkOrderCached[] {
  return items.filter((wo) => !isWorkOrderExpired(wo));
}

const ACTIVE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'];

/** Activo = asignado, aceptado o en progreso, y no vencido. */
export function isWorkOrderActive(wo: WorkOrderCached): boolean {
  if (!ACTIVE_STATUSES.includes(wo.status)) return false;
  return !isWorkOrderExpired(wo);
}

export function formatWorkOrderScheduledDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Sin fecha';
  return formatStoredCalendarDate(dateStr, 'es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}


export type { LocatedItem, LocationFloorGroup, LocationSubzoneGroup, LocationZoneGroup } from './location-hierarchy';
export { buildLocationHierarchy } from './location-hierarchy';

/** Pendiente = asignación PENDING (aceptar/rechazar). Aceptado = asignación ACCEPTED. */
export function categorizeWorkOrdersForUser(
  items: WorkOrderCached[],
  userId: string,
): { pending: WorkOrderCached[]; accepted: WorkOrderCached[] } {
  const pending: WorkOrderCached[] = [];
  const accepted: WorkOrderCached[] = [];

  for (const wo of items) {
    if (CLOSED_STATUSES.includes(wo.status)) continue;

    const assignment = getUserAssignment(wo, userId);
    if (!assignment) continue;

    if (assignment.status === 'PENDING') {
      pending.push(wo);
    } else if (assignment.status === 'ACCEPTED') {
      accepted.push(wo);
    }
  }

  return {
    pending: sortWorkOrdersByDate(pending),
    accepted: sortWorkOrdersByDate(accepted),
  };
}

interface ServiceExecutionRef {
  id: string;
  status?: string;
}

/** ID de la ejecución activa (no confundir con workOrder.id). */
export function getActiveServiceExecutionId(
  workOrder: { serviceExecutions?: ServiceExecutionRef[] | null },
): string | null {
  const executions = workOrder.serviceExecutions ?? [];
  if (executions.length === 0) return null;
  const inProgress = executions.find((se) => se.status === 'IN_PROGRESS');
  return (inProgress ?? executions[0])?.id ?? null;
}

const CHECKLIST_INCOMPLETE_PATTERNS = [
  /task\(s\) not executed yet/i,
  /tarea\(s\) sin ejecutar/i,
];

export function isChecklistIncompleteError(message: string): boolean {
  return CHECKLIST_INCOMPLETE_PATTERNS.some((pattern) => pattern.test(message));
}

export function formatChecklistIncompleteMessage(message: string): string {
  const countMatch = message.match(/^(\d+)\s+(?:task\(s\)|tarea\(s\))/i);
  const count = countMatch ? Number.parseInt(countMatch[1], 10) : null;

  if (count === 1) {
    return 'Queda 1 tarea sin marcar. Revisá el checklist para ver qué falta antes de completar el servicio.';
  }
  if (count !== null) {
    return `Quedan ${count} tareas sin marcar. Revisá el checklist para ver qué falta antes de completar el servicio.`;
  }
  return 'Quedan tareas sin marcar. Revisá el checklist antes de completar el servicio.';
}

const PHOTO_REQUIRED_PATTERNS = [
  /requires at least one photo when marked as done/i,
  /requiere al menos una foto/i,
  /faltan fotos de evidencia/i,
];

export function isPhotoRequiredError(message: string): boolean {
  return PHOTO_REQUIRED_PATTERNS.some((pattern) => pattern.test(message));
}

export function formatPhotoRequiredMessage(message: string): string {
  if (/faltan fotos de evidencia/i.test(message)) {
    return (
      'Faltan fotos de evidencia (antes, durante y/o después). ' +
      'Subí al menos una foto en cada fase antes de completar el servicio.'
    );
  }

  const taskMatch = message.match(/"(.+?)"/);
  const taskName = taskMatch?.[1];

  if (taskName) {
    return `La tarea "${taskName}" está marcada como hecha pero requiere al menos una foto. Subí la foto en el checklist antes de completar el servicio.`;
  }
  return 'Hay tareas marcadas como hechas que requieren foto. Revisá el checklist antes de completar el servicio.';
}

/** 403/Conflict típicos de doble tap o UI desactualizada tras accept/reject. */
export function isAlreadyRespondedAssignmentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('no pending assignment') ||
    message.includes('do not have a pending assignment') ||
    message.includes('no tenés una asignación pendiente') ||
    message.includes('no tenes una asignacion pendiente') ||
    message.includes('ya respondiste esta asignación') ||
    message.includes('ya respondiste esta asignacion')
  );
}

/** Conflict de start cuando la ejecución ya existe y el usuario ya participa. */
export function isAlreadyStartedWorkOrderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('already a participant') ||
    message.includes('ya sos participante') ||
    message.includes('ya eres participante') ||
    message.includes('already started') ||
    message.includes('ya fue iniciado')
  );
}

/** Traduce errores comunes de mutaciones de work order (EN legacy + ES). */
export function formatWorkOrderActionError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  const lower = message.toLowerCase();

  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('unexpected end of json') ||
    lower.includes('unexpected end of input')
  ) {
    return 'No se pudo confirmar la respuesta del servidor. Si la acción ya se aplicó, actualizá la pantalla.';
  }

  if (isAlreadyRespondedAssignmentError(error)) {
    return 'Ya respondiste esta asignación. Actualizá la pantalla para ver el estado actual.';
  }

  if (isAlreadyStartedWorkOrderError(error)) {
    return 'Este servicio ya fue iniciado. Actualizá la pantalla o abrí el checklist.';
  }

  if (
    lower.includes('active attendance') ||
    lower.includes('attendance record required') ||
    lower.includes('fichaje')
  ) {
    return 'Tenés que fichar entrada en este edificio antes de iniciar el servicio.';
  }

  if (
    lower.includes('must have an accepted assignment') ||
    lower.includes('asignación aceptada') ||
    lower.includes('asignacion aceptada')
  ) {
    return 'Tenés que aceptar el servicio antes de iniciarlo.';
  }

  if (
    lower.includes('cannot be accepted or rejected') ||
    lower.includes('no se puede aceptar ni rechazar')
  ) {
    return 'Este servicio ya no se puede aceptar ni rechazar en su estado actual.';
  }

  if (lower.includes('already completed') || lower.includes('ya está completado')) {
    return 'Este servicio ya está completado.';
  }

  if (
    lower.includes('cannot be completed from status') ||
    lower.includes('no se puede completar')
  ) {
    return 'Este servicio no se puede completar en su estado actual.';
  }

  return message || fallback;
}
