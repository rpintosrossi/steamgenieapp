import { AttendanceCached } from '../stores/building.store';

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
