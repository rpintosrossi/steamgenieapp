import { syncQueue, photoQueue, generateClientId } from './sync-queue';
import { useSyncStore } from '../stores/sync.store';
import { useAuthStore } from '../stores/auth.store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

// ─── Backend response types ───────────────────────────────────────────────────

interface BatchOperationResult {
  clientOperationId: string;
  status: 'SUCCESS' | 'FAILED' | 'ALREADY_PROCESSED' | 'CONFLICT';
  serverEntityId: string | null;
  entityType: string;
  version: number | null;
  error: { code: string; message: string } | null;
}

interface BatchResponse {
  serverTime: string;
  results: BatchOperationResult[];
}

// ─── SyncManager ──────────────────────────────────────────────────────────────

class SyncManager {
  private isSyncing = false;

  /**
   * Process all pending operations in the sync queue.
   * Safe to call multiple times — guards against concurrent runs.
   */
  async processBatch(accessToken: string): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    useSyncStore.getState().setStatus('syncing');

    try {
      const pending = await syncQueue.getPending(50);
      if (pending.length === 0) {
        useSyncStore.getState().setStatus('synced');
        return;
      }

      const deviceId = `mobile-${Date.now()}`;

      const body = {
        deviceId,
        operations: pending.map((item) => ({
          clientOperationId: item.clientOperationId,
          operationType: item.operationType,
          entityType: item.entityType,
          entityId: item.entityId ?? null,
          occurredAt: item.occurredAt,
          payload: item.payload,
        })),
      };

      const res = await fetch(`${API_BASE_URL}/sync/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? 'Sync failed');
      }

      const result: BatchResponse = await res.json();

      for (const opResult of result.results) {
        if (opResult.status === 'SUCCESS' || opResult.status === 'ALREADY_PROCESSED') {
          await syncQueue.markSuccess(opResult.clientOperationId);
        } else if (opResult.status === 'CONFLICT') {
          await syncQueue.markStatus(opResult.clientOperationId, 'CONFLICT');
        } else {
          await syncQueue.markFailed(
            opResult.clientOperationId,
            opResult.error?.message ?? 'Unknown error',
          );
        }
      }

      const remainingCount = await syncQueue.countPending();
      useSyncStore.getState().setPendingCount(remainingCount);

      if (remainingCount === 0) {
        useSyncStore.getState().setLastSynced();
      } else {
        useSyncStore.getState().setStatus('pending');
      }
    } catch (e) {
      useSyncStore.getState().setError(e instanceof Error ? e.message : 'Error de sincronización');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upload pending photos from the photo queue.
   */
  async uploadPendingPhotos(accessToken: string): Promise<void> {
    const pending = await photoQueue.getPending();

    for (const photo of pending) {
      try {
        const formData = new FormData();

        formData.append('photo', {
          uri: photo.localUri,
          name: `photo_${Date.now()}.jpg`,
          type: photo.mimeType,
        } as unknown as Blob);

        if (photo.capturedAt) formData.append('capturedAt', photo.capturedAt);
        if (photo.gpsLat != null) formData.append('gpsLat', String(photo.gpsLat));
        if (photo.gpsLng != null) formData.append('gpsLng', String(photo.gpsLng));
        if (photo.deviceId) formData.append('deviceId', photo.deviceId);
        formData.append('clientOperationId', photo.clientOperationId);

        const res = await fetch(
          `${API_BASE_URL}/service-executions/${photo.serviceExecutionId}/work-order-tasks/${photo.workOrderTaskId}/photos`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData,
          },
        );

        if (res.ok || res.status === 409) {
          // 409 = conflict (already uploaded via clientOperationId) → treat as success
          await photoQueue.markSuccess(photo.clientOperationId);
        } else {
          const err = await res.json().catch(() => ({}));
          await photoQueue.markFailed(
            photo.clientOperationId,
            (err as { message?: string }).message ?? `HTTP ${res.status}`,
          );
        }
      } catch (e) {
        await photoQueue.markFailed(
          photo.clientOperationId,
          e instanceof Error ? e.message : 'Upload error',
        );
      }
    }
  }

  /**
   * Full sync: batch operations + pending photos.
   */
  async syncAll(): Promise<void> {
    const accessToken = await useAuthStore.getState().ensureAccessToken();
    if (!accessToken) return;

    await this.processBatch(accessToken);
    await this.uploadPendingPhotos(accessToken);
  }

  /**
   * Refresh pending count from DB and update the sync store.
   */
  async refreshPendingCount(): Promise<void> {
    const [opCount, photoCount] = await Promise.all([
      syncQueue.countPending(),
      photoQueue.countPending(),
    ]);
    const total = opCount + photoCount;
    useSyncStore.getState().setPendingCount(total);
    if (total > 0) {
      useSyncStore.getState().setStatus('pending');
    }
  }
}

export const syncManager = new SyncManager();
