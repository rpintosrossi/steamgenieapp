export class MarkTaskDto {
  /** ID from work_order_tasks (the snapshot row). NOT the master task id. */
  workOrderTaskId!: string;

  /** DONE | NOT_DONE | SKIPPED */
  status!: 'DONE' | 'NOT_DONE' | 'SKIPPED';

  /** Required when status = NOT_DONE and the task snapshot has requiresRejectionReasonSnapshot = true. */
  rejectionReasonId?: string;

  /** Free-text observation. Only allowed when task snapshot has allowsObservationSnapshot = true. */
  observation?: string;
}
