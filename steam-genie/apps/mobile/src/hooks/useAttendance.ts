import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { apiService } from '../services/api.service';
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

  const { selectedBuilding, prefetchData, updateActiveAttendance } = useBuildingStore();
  const { setStatus } = useSyncStore();

  const activeAttendance = prefetchData?.activeAttendance ?? null;

  async function fetchActiveAttendance(): Promise<AttendanceCached | null> {
    const active = await apiService.get<ActiveAttendanceResponse | null>(
      '/attendance/active',
    );
    return active ? mapActiveAttendance(active) : null;
  }

  /** Si la red falló pero el servidor sí registró el fichaje, sincroniza estado local. */
  async function reconcileAfterNetworkError(
    mode: 'check-in' | 'check-out',
    buildingId?: string,
  ): Promise<boolean> {
    try {
      const active = await fetchActiveAttendance();
      if (mode === 'check-in' && buildingId && active?.buildingId === buildingId) {
        updateActiveAttendance(active);
        return true;
      }
      if (mode === 'check-out' && !active) {
        updateActiveAttendance(null);
        return true;
      }
    } catch {
      // ignore reconciliation errors
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
      if (isOnline && isNetworkError(e) && selectedBuilding) {
        const reconciled = await reconcileAfterNetworkError(
          'check-in',
          selectedBuilding.id,
        );
        if (reconciled) return true;
      }
      setError(e instanceof Error ? e.message : 'Error al fichar entrada');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [selectedBuilding, isOnline, updateActiveAttendance, setStatus]);

  const checkOut = useCallback(async (): Promise<boolean> => {
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
      if (isOnline && isNetworkError(e)) {
        const reconciled = await reconcileAfterNetworkError('check-out');
        if (reconciled) return true;
      }
      setError(e instanceof Error ? e.message : 'Error al fichar salida');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, updateActiveAttendance, setStatus]);

  return { activeAttendance, isLoading, error, checkIn, checkOut, clearError: () => setError(null) };
}
