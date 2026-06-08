/**
 * Task frequencies.
 * IMPORTANT: EVENTUAL tasks must NEVER appear in the periodic tasks module.
 * They are only used when generating work_order_tasks snapshots for a work order.
 */
export const TASK_FREQUENCIES = {
  EVENTUAL: 'EVENTUAL',
  DAILY: 'DAILY',
  MON_FRI: 'MON_FRI',
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  BIANNUAL: 'BIANNUAL',
  ANNUAL: 'ANNUAL',
} as const;

export type TaskFrequency = (typeof TASK_FREQUENCIES)[keyof typeof TASK_FREQUENCIES];

/** Frequencies eligible for the periodic tasks module (excludes EVENTUAL) */
export const PERIODIC_FREQUENCIES = Object.values(TASK_FREQUENCIES).filter(
  (f) => f !== TASK_FREQUENCIES.EVENTUAL,
) as TaskFrequency[];
