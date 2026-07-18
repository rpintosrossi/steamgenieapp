'use client';

import { BuildingHierarchyManager } from '../../../../../components/BuildingHierarchyManager';
import { useBuildingDetail } from '../../../buildings/[id]/BuildingDetailContext';
import { useParticularClientDetail } from '../ParticularClientDetailContext';

export default function ParticularClientZonesPage() {
  const { building, refresh: refreshBuilding } = useBuildingDetail();
  const { setError, setSuccess } = useParticularClientDetail();

  return (
    <BuildingHierarchyManager
      building={building}
      onRefresh={refreshBuilding}
      onError={(msg) => setError(msg || null)}
      onSuccess={(msg) => {
        setSuccess(msg);
        setError(null);
      }}
    />
  );
}
