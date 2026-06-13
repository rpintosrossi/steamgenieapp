import { useState, useCallback, useRef } from 'react';
import { apiService, ApiRequestError } from '../services/api.service';
import { syncQueue, generateClientId } from '../sync/sync-queue';
import { useBuildingStore, AttendanceCached } from '../stores/building.store';
import { useSyncStore } from '../stores/sync.store';
import {
  mapActiveAttendance,
  type ActiveAttendanceResponse,
} from '../utils/attendance';
import { isNetworkError } from '../utils/network';
import { getRequiredGpsPosition } from '../utils/location';
import { sleep } from '../utils/async';

export type AttendanceAction = 'check-in' | 'check-out';

/** Esperas entre reintentos cuando el POST falla pero el servidor pudo haber procesado. */
const RECONCILE_DELAYS_MS = [0, 500, 1200, 2500] as const;
/** Salida suele tardar más en propagarse; más ventana + prefetch como fallback. */
const RECONCILE_CHECKOUT_DELAYS_MS = [0, 500, 1200, 2500, 4000, 6000] as const;

export function useAttendance(isOnline: boolean) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionInFlight = useRef(false);

  const { selectedBuilding, prefetchData, updateActiveAttendance, syncActiveAttendance } =
    useBuildingStore();
  const { setStatus } = useSyncStore();

  const activeAttendance = prefetchData?.activeAttendance ?? null;

  async function reconcileCheckIn(buildingId: string): Promise<boolean> {
    for (const delayMs of RECONCILE_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs);
      try {
        const active = await apiService.get<ActiveAttendanceResponse | null>(
          '/attendance/active',
        );
        const mapped = active ? mapActiveAttendance(active) : null;
        updateActiveAttendance(mapped);
        if (mapped?.buildingId === buildingId) return true;
      } catch {
        // Reintentar: red inestable o el servidor aún no reflejó el fichaje.
      }
    }
    return false;
  }

  async function reconcileCheckOut(): Promise<boolean> {
    const { selectedBuilding, refreshPrefetch } = useBuildingStore.getState();

    for (const delayMs of RECONCILE_CHECKOUT_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs);

      try {
        const active = await apiService.get<ActiveAttendanceResponse | null>(
          '/attendance/active',
        );
        const mapped = active ? mapActiveAttendance(active) : null;
        updateActiveAttendance(mapped);
        if (mapped === null) return true;
      } catch {
        // Reintentar
      }

      if (selectedBuilding) {
        try {
          await refreshPrefetch();
          const activeAfterPrefetch =
            useBuildingStore.getState().prefetchData?.activeAttendance ?? null;
          if (activeAfterPrefetch === null) return true;
        } catch {
          // Reintentar
        }
      }
    }
    return false;
  }

  function isAlreadyCheckedInError(error: unknown): boolean {
    if (error instanceof ApiRequestError && error.statusCode === 409) return true;
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('already have an active check-in')
    ) {
      return true;
    }
    return false;
  }

  function isAlreadyCheckedOutError(error: unknown): boolean {
    if (error instanceof ApiRequestError && error.statusCode === 404) return true;
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('no active check-in')
    ) {
      return true;
    }
    return false;
  }

  const checkIn = useCallback(async (): Promise<boolean> => {
    if (!selectedBuilding) {
      setError('No hay edificio seleccionado.');
      return false;
    }
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const { gpsLat, gpsLng } = await getRequiredGpsPosition();
      const occurredAt = new Date().toISOString();

      if (isOnline) {
        const clientOperationId = generateClientId();
        const attendance = await apiService.post<ActiveAttendanceResponse>(
          '/attendance/check-in',
          {
            buildingId: selectedBuilding.id,
            gpsLat,
            gpsLng,
            occurredAt,
            clientOperationId,
            deviceId: 'mobile',
          },
        );
        updateActiveAttendance(mapActiveAttendance(attendance));
      } else {
        const clientOperationId = generateClientId();
        await syncQueue.enqueue({
          id: generateClientId(),
          clientOperationId,
          operationType: 'CHECK_IN',
          entityType: 'ATTENDANCE',
          entityId: null,
          payload: {
            buildingId: selectedBuilding.id,
            gpsLat,
            gpsLng,
            deviceId: 'mobile',
          },
          occurredAt,
        });
        // Optimistic update
        updateActiveAttendance({
          id: clientOperationId,
          buildingId: selectedBuilding.id,
          checkInAt: occurredAt,
          checkInGpsLat: String(gpsLat),
          checkInGpsLng: String(gpsLng),
          version: 1,
        });
        setStatus('pending');
      }
      return true;
    } catch (e) {
      if (isOnline && selectedBuilding) {
        const shouldReconcile =
          isNetworkError(e) || isAlreadyCheckedInError(e);
        if (shouldReconcile) {
          const reconciled = await reconcileCheckIn(selectedBuilding.id);
          if (reconciled) {
            setError(null);
            return true;
          }
        }
      }
      setError(e instanceof Error ? e.message : 'Error al fichar entrada');
      return false;
    } finally {
      actionInFlight.current = false;
      setIsLoading(false);
    }
  }, [selectedBuilding, isOnline, updateActiveAttendance, syncActiveAttendance, setStatus]);

  const checkOut = useCallback(async (): Promise<boolean> => {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const { gpsLat, gpsLng } = await getRequiredGpsPosition();
      const occurredAt = new Date().toISOString();

      if (isOnline) {
        await apiService.postOk('/attendance/check-out', {
          gpsLat,
          gpsLng,
          occurredAt,
          deviceId: 'mobile',
        });
        updateActiveAttendance(null);
      } else {
        await syncQueue.enqueue({
          id: generateClientId(),
          clientOperationId: generateClientId(),
          operationType: 'CHECK_OUT',
          entityType: 'ATTENDANCE',
          entityId: null,
          payload: {
            gpsLat,
            gpsLng,
            deviceId: 'mobile',
          },
          occurredAt,
        });
        // Optimistic update
        updateActiveAttendance(null);
        setStatus('pending');
      }
      return true;
    } catch (e) {
      if (isOnline) {
        const shouldReconcile =
          isNetworkError(e) || isAlreadyCheckedOutError(e);
        if (shouldReconcile) {
          const reconciled = await reconcileCheckOut();
          if (reconciled) {
            setError(null);
            return true;
          }
        }
      }
      setError(e instanceof Error ? e.message : 'Error al fichar salida');
      return false;
    } finally {
      actionInFlight.current = false;
      setIsLoading(false);
    }
  }, [isOnline, updateActiveAttendance, syncActiveAttendance, setStatus]);

  return {
    activeAttendance,
    isLoading,
    error,
    checkIn,
    checkOut,
    syncAttendance: syncActiveAttendance,
    clearError: () => setError(null),
  };
}
