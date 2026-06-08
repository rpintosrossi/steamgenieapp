export interface TaskExecutionItem {
  workOrderTaskId: string;
  nameSnapshot: string;
  sortOrder: number;
  requiresPhotoSnapshot: boolean;
  allowsObservationSnapshot: boolean;
  requiresRejectionReasonSnapshot: boolean;
  /** null when the task has not been executed yet */
  execution: TaskExecutionDetail | null;
}

export interface TaskExecutionDetail {
  id: string;
  status: string;
  executedById: string;
  executedByName: string;
  executedAt: Date;
  observation: string | null;
  photoCount: number;
}
