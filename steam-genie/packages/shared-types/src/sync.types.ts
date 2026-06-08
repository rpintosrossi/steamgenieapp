export type SyncOperationStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'ERROR';

export interface SyncQueueEntry {
  clientOperationId: string;
  deviceId: string;
  userId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: Record<string, unknown>;
  occurredAt: string; // ISO 8601
  sentAt: string | null;
  baseVersion: number;
  status: SyncOperationStatus;
}

export interface SyncBatchRequest {
  operations: SyncQueueEntry[];
}

export interface SyncOperationResult {
  clientOperationId: string;
  status: SyncOperationStatus;
  conflictReason?: string;
  message?: string;
  serverEntityState?: Record<string, unknown>;
}

export interface SyncBatchResponse {
  results: SyncOperationResult[];
}
