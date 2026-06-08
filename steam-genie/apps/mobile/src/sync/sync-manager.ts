import { SyncQueue } from './sync-queue';
import type { SyncBatchRequest, SyncBatchResponse } from '@steam-genie/shared-types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class SyncManager {
  private queue = new SyncQueue();
  private isSyncing = false;

  async sync(accessToken: string): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const pending = await this.queue.dequeue(50);
      if (pending.length === 0) return;

      const batch: SyncBatchRequest = { operations: pending as any };

      const res = await fetch(`${API_BASE_URL}/sync/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) return;

      const result: SyncBatchResponse = await res.json();

      for (const op of result.results) {
        if (op.success) {
          await this.queue.remove(op.clientOperationId);
        } else {
          await this.queue.markFailed(op.clientOperationId, op.error ?? 'Unknown error');
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Prefetch work orders and tasks from server for offline use.
   * Call on login + reconnect.
   */
  async prefetch(accessToken: string): Promise<void> {
    // TODO: GET /sync/prefetch → store in work_orders_cache and tasks_cache
  }
}

export const syncManager = new SyncManager();
