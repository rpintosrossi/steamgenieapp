import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { apiService, ApiRequestError } from '../services/api.service';
import { syncQueue, generateClientId } from '../sync/sync-queue';
import { useBuildingStore, AttendanceCached } from '../stores/building.store';
import { useSyncStore } from '../stores/sync.store';
import {
  mapActiveAttendance,
  type ActiveAttendanceResponse,
} from '../utils/attendance';
import { isNetworkError } from '../utils/network';

export type AttendanceAction = 'check-in' | 'check-out';

export function useAttendance(isOnline: boolean) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionInFlight = useRef(false);

  const { selectedBuilding, prefetchData, updateActiveAttendance, syncActiveAttendance } =
    useBuildingStore();
  const { setStatus } = useSyncStore();

  const activeAttendance = prefetchData?.activeAttendance ?? null;

  async function reconcileCheckIn(buildingId: string): Promise<boolean> {
    const active = await syncActiveAttendance();
    if (active?.buildingId === buildingId) return true;
    return false;
  }

  async function reconcileCheckOut(): Promise<boolean> {
    const active = await syncActiveAttendance();
    return active === null;
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

  async function getGps(): Promise<{ gpsLat: number; gpsLng: number }> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('GPS obligatorio. Habilitá los permisos de ubicación en Configuración.');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      gpsLat: location.coords.latitude,
      gpsLng: location.coords.longitude,
    };
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
      const { gpsLat, gpsLng } = await getGps();
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
        if (isAlreadyCheckedInError(e)) {
          const reconciled = await reconcileCheckIn(selectedBuilding.id);
          if (reconciled) return true;
        }
        if (isNetworkError(e)) {
          const reconciled = await reconcileCheckIn(selectedBuilding.id);
          if (reconciled) return true;
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
      const { gpsLat, gpsLng } = await getGps();
      const occurredAt = new Date().toISOString();

      if (isOnline) {
        await apiService.post('/attendance/check-out', {
          gpsLat,
          gpsLng,
          occurredAt,
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
        if (isNetworkError(e)) {
          const reconciled = await reconcileCheckOut();
          if (reconciled) return true;
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
