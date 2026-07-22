import { BuildingMode, PhotoEvidenceMode } from '@prisma/client';

type BuildingPhotoSettings = {
  buildingMode?: BuildingMode | null;
  photoEvidenceMode?: PhotoEvidenceMode | null;
} | null | undefined;

/**
 * Phase photo evidence (BEFORE/DURING/AFTER) only applies in SIMPLE mode.
 * DETAILED buildings always use per-task photos.
 */
export function resolvePhotoEvidenceMode(
  building: BuildingPhotoSettings,
): PhotoEvidenceMode {
  if (
    building?.buildingMode === BuildingMode.SIMPLE &&
    building.photoEvidenceMode === PhotoEvidenceMode.BEFORE_DURING_AFTER
  ) {
    return PhotoEvidenceMode.BEFORE_DURING_AFTER;
  }
  return PhotoEvidenceMode.PER_TASK;
}
