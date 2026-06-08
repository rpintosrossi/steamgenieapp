import { getDatabase } from '../db/database';
import type { SyncQueueEntry } from '@steam-genie/shared-types';

export class SyncQueue {
  private db = getDatabase();

  async enqueue(entry: Omit<SyncQueueEntry, 'attempts' | 'lastError'>): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sync_queue (id, operation, entity, payload, client_operation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.operation,
        entry.entity,
        JSON.stringify(entry.payload),
        entry.clientOperationId,
        entry.createdAt,
      ],
    );
  }

  async dequeue(limit = 50): Promise<SyncQueueEntry[]> {
    const rows = await this.db.getAllAsync<Record<string, string>>(
      `SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT ?`,
      [limit],
    );
    return rows.map((row) => ({
      ...row,
      payload: JSON.parse(row.payload),
      attempts: Number(row.attempts),
    })) as unknown as SyncQueueEntry[];
  }

  async remove(id: string): Promise<void> {
    await this.db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
      [error, id],
    );
  }
}
