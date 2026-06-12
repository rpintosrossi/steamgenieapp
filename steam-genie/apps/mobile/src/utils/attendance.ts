import { AttendanceCached } from '../stores/building.store';

export interface ActiveAttendanceResponse {
  id: string;
  buildingId: string;
  checkInAt: string;
  checkInGpsLat: number | string | null;
  checkInGpsLng: number | string | null;
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
