export interface TaskPhotoSummary {
  id: string;
  storageKey: string;
  url: string;
  originalFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  capturedAt: Date | null;
  uploadedAt: Date;
}

export interface TaskExecutionDetail {
  id: string;
  status: string;
  executedById: string;
  executedByName: string;
  executedAt: Date;
  observation: string | null;
  photoCount: number;
  photos: TaskPhotoSummary[];
}

export interface TaskExecutionItem {
  workOrderTaskId: string;
  nameSnapshot: string;
  sortOrder: number;
  requiresPhotoSnapshot: boolean;
  allowsObservationSnapshot: boolean;
  requiresRejectionReasonSnapshot: boolean;
  zoneId: string | null;
  subzoneId: string | null;
  /** null when the task has not been executed yet */
  execution: TaskExecutionDetail | null;
}
