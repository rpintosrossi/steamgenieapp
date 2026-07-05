export interface TaskCustomFieldOptionSummary {
  id: string;
  label: string;
  sortOrder: number;
}

export interface TaskCustomFieldSummary {
  id: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  showInReport: boolean;
  sortOrder: number;
  options: TaskCustomFieldOptionSummary[];
}

export interface TaskFieldValueSummary {
  fieldId: string;
  selectedOptionIds: string[];
}

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
  fieldValues: TaskFieldValueSummary[];
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
  customFields: TaskCustomFieldSummary[];
  /** null when the task has not been executed yet */
  execution: TaskExecutionDetail | null;
}
