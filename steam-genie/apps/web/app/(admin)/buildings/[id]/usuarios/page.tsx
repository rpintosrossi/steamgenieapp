'use client';

import { BuildingUsersManager } from '../../../../../components/BuildingUsersManager';
import { useBuildingDetail } from '../BuildingDetailContext';

export default function BuildingUsersPage() {
  const { building, setError, setSuccess } = useBuildingDetail();

  return (
    <BuildingUsersManager
      buildingId={building.id}
      buildingName={building.name}
      onError={(msg) => setError(msg || null)}
      onSuccess={(msg) => {
        setSuccess(msg);
        setError(null);
      }}
    />
  );
}
