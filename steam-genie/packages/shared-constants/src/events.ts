// Domain event type strings — used in domain_events.eventType
export const DOMAIN_EVENTS = {
  // Attendance
  ATTENDANCE_CHECKED_IN: 'attendance.checked_in',
  ATTENDANCE_CHECKED_OUT: 'attendance.checked_out',
  ATTENDANCE_FORGOT_CHECKOUT: 'attendance.forgot_checkout',
  ATTENDANCE_CORRECTED: 'attendance.corrected',

  // WorkOrder
  WORK_ORDER_CREATED: 'work_order.created',
  WORK_ORDER_ASSIGNED: 'work_order.assigned',
  WORK_ORDER_ASSIGNMENT_ACCEPTED: 'work_order.assignment.accepted',
  WORK_ORDER_ASSIGNMENT_REJECTED: 'work_order.assignment.rejected',
  WORK_ORDER_STARTED: 'work_order.started',
  WORK_ORDER_COMPLETED: 'work_order.completed',
  WORK_ORDER_STATUS_CHANGED: 'work_order.status_changed',
  WORK_ORDER_ALERT_UNASSIGNED: 'work_order.alert_unassigned',

  // ServiceExecution / Tasks
  SERVICE_EXECUTION_STARTED: 'service_execution.started',
  SERVICE_EXECUTION_COMPLETED: 'service_execution.completed',
  TASK_EXECUTION_DONE: 'task_execution.done',
  TASK_EXECUTION_NOT_DONE: 'task_execution.not_done',
  PERIODIC_TASK_EXPIRED: 'periodic_task.expired',

  // Reservations
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_WORK_ORDER_GENERATED: 'reservation.work_order_generated',
  RESERVATION_STATUS_CHANGED: 'reservation.status_changed',

  // Sync
  SYNC_CONFLICT_DETECTED: 'sync.conflict_detected',
  SYNC_BATCH_RECEIVED: 'sync.batch_received',

  // Integrations
  INTEGRATION_INBOUND_RECEIVED: 'integration.inbound_received',
  INTEGRATION_RESERVATION_PARSED: 'integration.reservation_parsed',
  INTEGRATION_PARSE_ERROR: 'integration.parse_error',
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
