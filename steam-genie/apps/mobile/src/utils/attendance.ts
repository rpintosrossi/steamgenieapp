import { AttendanceCached, type Building } from '../stores/building.store';

export interface ActiveAttendanceResponse {
  id: string;
  buildingId: string;
  checkInAt: string;
  checkInGpsLat: number | string | null;
  checkInGpsLng: number | string | null;
  checkInOutOfRange?: boolean;
  checkInDistanceM?: number | null;
  version?: number;
}

export function mapActiveAttendance(
  attendance: ActiveAttendanceResponse,
): AttendanceCached {
  return {
    id: attendance.id,
    buildingId: attendance.buildingId,
    checkInAt: attendance.checkInAt,
    checkInGpsLat:
      attendance.checkInGpsLat != null ? String(attendance.checkInGpsLat) : null,
    checkInGpsLng:
      attendance.checkInGpsLng != null ? String(attendance.checkInGpsLng) : null,
    version: attendance.version ?? 1,
  };
}

/** Distancia Haversine en metros (WGS-84). */
export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Si el edificio exige GPS y la posición está fuera del radio, devuelve
 * un mensaje de advertencia (el fichaje igual se permite).
 */
export function getGpsOutOfRangeWarning(
  building: Pick<
    Building,
    'name' | 'latitude' | 'longitude' | 'gpsRadiusM' | 'requireGpsValidation'
  > | null | undefined,
  gpsLat: number,
  gpsLng: number,
  action: 'entrada' | 'salida' = 'entrada',
): string | null {
  if (!building || building.requireGpsValidation === false) return null;
  if (building.latitude == null || building.longitude == null) return null;

  const buildingLat = Number(building.latitude);
  const buildingLng = Number(building.longitude);
  if (!Number.isFinite(buildingLat) || !Number.isFinite(buildingLng)) return null;

  const distanceM = Math.round(
    haversineDistanceM(buildingLat, buildingLng, gpsLat, gpsLng),
  );
  if (distanceM <= building.gpsRadiusM) return null;

  return (
    `Fichaste ${action} a ${distanceM} m de "${building.name}". ` +
    `El radio configurado es de ${building.gpsRadiusM} m. ` +
    `El fichaje se registró con una advertencia.`
  );
}

export function isCheckedInAtBuilding(
  activeAttendance: AttendanceCached | null | undefined,
  buildingId: string | null | undefined,
): boolean {
  return Boolean(
    activeAttendance?.buildingId &&
      buildingId &&
      activeAttendance.buildingId === buildingId,
  );
}

export const ATTENDANCE_REQUIRED_MESSAGE =
  'Para iniciar o realizar un servicio tenés que estar fichado en el edificio correspondiente.';
