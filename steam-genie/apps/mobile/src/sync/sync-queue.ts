import { getDatabase } from '../db/database';
import type { PhotoPhase } from '../utils/camera';

export type SyncOperationType =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'START_WORK_ORDER'
  | 'MARK_WORK_ORDER_TASK'
  | 'MARK_PERIODIC_TASK'
  | 'COMPLETE_WORK_ORDER';

export interface SyncQueueItem {
  id: string;
  clientOperationId: string;
  operationType: SyncOperationType;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ALREADY_PROCESSED' | 'CONFLICT';
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export type PhotoQueueKind = 'task' | 'service_phase' | 'periodic_phase';

export interface PhotoQueueItem {
  id: string;
  clientOperationId: string;
  photoKind: PhotoQueueKind;
  serviceExecutionId: string | null;
  workOrderTaskId: string | null;
  periodicInstanceId: string | null;
  phase: PhotoPhase | null;
  localUri: string;
  mimeType: string;
  capturedAt: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  deviceId: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  attempts: number;
  lastError: string | null;
}

// ─── SyncQueue ────────────────────────────────────────────────────────────────

export class SyncQueue {
  private get db() {
    return getDatabase();
  }

  async enqueue(item: Omit<SyncQueueItem, 'attempts' | 'lastError' | 'createdAt' | 'status'>): Promise<void> {
    await this.db.runAsync(
      `INSERT OR IGNORE INTO sync_queue
         (id, client_operation_id, operation_type, entity_type, entity_id, payload, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.clientOperationId,
        item.operationType,
        item.entityType,
        item.entityId ?? null,
        JSON.stringify(item.payload),
        item.occurredAt,
      ],
    );
  }

  async getPending(limit = 50): Promise<SyncQueueItem[]> {
    const rows = await this.db.getAllAsync<Record<string, string | number>>(
      `SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT ?`,
      [limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      clientOperationId: String(row.client_operation_id),
      operationType: String(row.operation_type) as SyncOperationType,
      entityType: String(row.entity_type),
      entityId: row.entity_id ? String(row.entity_id) : null,
      payload: JSON.parse(String(row.payload)),
      occurredAt: String(row.occurred_at),
      status: String(row.status) as SyncQueueItem['status'],
      attempts: Number(row.attempts),
      lastError: row.last_error ? String(row.last_error) : null,
      createdAt: String(row.created_at),
    }));
  }

  async countPending(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING'`,
    );
    return row?.count ?? 0;
  }

  async markSuccess(clientOperationId: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE sync_queue SET status = 'SUCCESS' WHERE client_operation_id = ?`,
      [clientOperationId],
    );
  }

  async markFailed(clientOperationId: string, error: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE sync_queue
       SET status = 'FAILED', attempts = attempts + 1, last_error = ?
       WHERE client_operation_id = ?`,
      [error, clientOperationId],
    );
  }

  async markStatus(
    clientOperationId: string,
    status: SyncQueueItem['status'],
  ): Promise<void> {
    await this.db.runAsync(
      `UPDATE sync_queue SET status = ? WHERE client_operation_id = ?`,
      [status, clientOperationId],
    );
  }

  // Reset FAILED to PENDING for retry
  async requeueFailed(): Promise<void> {
    await this.db.runAsync(
      `UPDATE sync_queue SET status = 'PENDING' WHERE status = 'FAILED' AND attempts < 5`,
    );
  }
}

// ─── PhotoQueue ───────────────────────────────────────────────────────────────

export class PhotoQueue {
  private get db() {
    return getDatabase();
  }

  async enqueue(item: Omit<PhotoQueueItem, 'attempts' | 'lastError' | 'status'>): Promise<void> {
    await this.db.runAsync(
      `INSERT OR IGNORE INTO photo_queue
         (id, client_operation_id, photo_kind, service_execution_id, work_order_task_id,
          periodic_instance_id, phase, local_uri, mime_type, captured_at, gps_lat, gps_lng, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.clientOperationId,
        item.photoKind,
        item.serviceExecutionId ?? null,
        item.workOrderTaskId ?? null,
        item.periodicInstanceId ?? null,
        item.phase ?? null,
        item.localUri,
        item.mimeType,
        item.capturedAt ?? null,
        item.gpsLat ?? null,
        item.gpsLng ?? null,
        item.deviceId ?? null,
      ],
    );
  }

  async getPending(): Promise<PhotoQueueItem[]> {
    const rows = await this.db.getAllAsync<Record<string, string | number>>(
      `SELECT * FROM photo_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 20`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      clientOperationId: String(row.client_operation_id),
      photoKind: (row.photo_kind ? String(row.photo_kind) : 'task') as PhotoQueueKind,
      serviceExecutionId: row.service_execution_id ? String(row.service_execution_id) : null,
      workOrderTaskId: row.work_order_task_id ? String(row.work_order_task_id) : null,
      periodicInstanceId: row.periodic_instance_id ? String(row.periodic_instance_id) : null,
      phase: row.phase ? (String(row.phase) as PhotoPhase) : null,
      localUri: String(row.local_uri),
      mimeType: String(row.mime_type),
      capturedAt: row.captured_at ? String(row.captured_at) : null,
      gpsLat: row.gps_lat != null ? Number(row.gps_lat) : null,
      gpsLng: row.gps_lng != null ? Number(row.gps_lng) : null,
      deviceId: row.device_id ? String(row.device_id) : null,
      status: String(row.status) as PhotoQueueItem['status'],
      attempts: Number(row.attempts),
      lastError: row.last_error ? String(row.last_error) : null,
    }));
  }

  async countPending(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM photo_queue WHERE status = 'PENDING'`,
    );
    return row?.count ?? 0;
  }

  async markSuccess(clientOperationId: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE photo_queue SET status = 'SUCCESS' WHERE client_operation_id = ?`,
      [clientOperationId],
    );
  }

  async markFailed(clientOperationId: string, error: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE photo_queue
       SET status = 'FAILED', attempts = attempts + 1, last_error = ?
       WHERE client_operation_id = ?`,
      [error, clientOperationId],
    );
  }
}

// ─── Singletons ────────────────────────────────────────────────────────────────
export const syncQueue = new SyncQueue();
export const photoQueue = new PhotoQueue();

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
