import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { apiService } from '../services/api.service';
import { syncQueue, photoQueue, generateClientId } from '../sync/sync-queue';
import { useBuildingStore, AttendanceCached } from '../stores/building.store';
import { useSyncStore } from '../stores/sync.store';

export type AttendanceAction = 'check-in' | 'check-out';

export function useAttendance(isOnline: boolean) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { selectedBuilding, prefetchData, updateActiveAttendance } = useBuildingStore();
  const { setStatus } = useSyncStore();

  const activeAttendance = prefetchData?.activeAttendance ?? null;

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

  const checkIn = useCallback(async () => {
    if (!selectedBuilding) {
      setError('No hay edificio seleccionado.');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const { gpsLat, gpsLng } = await getGps();
      const occurredAt = new Date().toISOString();

      if (isOnline) {
        const attendance = await apiService.post<AttendanceCached>('/attendance/check-in', {
          buildingId: selectedBuilding.id,
          gpsLat,
          gpsLng,
          occurredAt,
        });
        updateActiveAttendance(attendance);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al fichar entrada');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBuilding, isOnline, updateActiveAttendance]);

  const checkOut = useCallback(async () => {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al fichar salida');
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, updateActiveAttendance]);

  return { activeAttendance, isLoading, error, checkIn, checkOut, clearError: () => setError(null) };
}
