export const TASK_FREQUENCY_LABELS: Record<string, string> = {
  EVENTUAL: 'Eventual (checkout)',
  DAILY: 'Diaria',
  MON_FRI: 'Lun–Vie',
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  BIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Próxima',
  CHECKIN_DAY: 'Día de check-in',
  ACTIVE: 'En curso',
  CHECKOUT_DAY: 'Día de checkout',
  COMPLETED: 'Finalizada',
};

export const RESERVATION_ZONE_READINESS_LABELS = {
  readyToOccupy: 'Lista para habitar',
  notReady: 'Zona no lista',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Encargado',
  cleaner: 'Limpiador',
  client: 'Cliente',
  provider: 'Proveedor',
  stock: 'Encargado de stock',
};

export const WORK_ORDER_TYPE_LABELS: Record<string, string> = {
  CHECKOUT_CLEANING: 'Limpieza checkout',
  ADDITIONAL_REQUEST: 'Pedido adicional',
};

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: 'Sin asignar',
  QUOTE_ACCEPTED: 'Presupuesto aceptado',
  ASSIGNED: 'Asignado (pendiente aceptación)',
  ACCEPTED: 'Aceptado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
  REJECTED: 'Rechazado',
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
};

export const RECURRING_WORK_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completada',
  SCHEDULED: 'Programada',
  OVERDUE: 'Vencida',
};

export const TASK_EXECUTION_STATUS_LABELS: Record<string, string> = {
  DONE: 'Realizada',
  NOT_DONE: 'No realizada',
  SKIPPED: 'Omitida',
};
