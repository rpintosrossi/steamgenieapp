'use client';

import { BuildingSettingsCard } from '../../../../../components/BuildingSettingsCard';
import { useBuildingDetail } from '../BuildingDetailContext';

export default function BuildingConfigPage() {
  const { building, setBuilding, setError, setSuccess } = useBuildingDetail();

  return (
    <BuildingSettingsCard
      building={building}
      onSaved={(updated) => setBuilding(updated)}
      onError={(msg) => setError(msg || null)}
      onSuccess={(msg) => {
        setSuccess(msg);
        setError(null);
      }}
    />
  );
}
