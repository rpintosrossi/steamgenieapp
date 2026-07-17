'use client';

import { BuildingHierarchyManager } from '../../../../../components/BuildingHierarchyManager';
import { useBuildingDetail } from '../BuildingDetailContext';

export default function BuildingZonesPage() {
  const { building, refresh, setError, setSuccess } = useBuildingDetail();

  return (
    <BuildingHierarchyManager
      building={building}
      onRefresh={refresh}
      onError={(msg) => setError(msg || null)}
      onSuccess={(msg) => {
        setSuccess(msg);
        setError(null);
      }}
    />
  );
}
