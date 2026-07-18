'use client';

import { BuildingSettingsCard } from '../../../../../components/BuildingSettingsCard';
import { useBuildingDetail } from '../../../buildings/[id]/BuildingDetailContext';
import { useParticularClientDetail } from '../ParticularClientDetailContext';

export default function ParticularClientConfigPage() {
  const { building, setBuilding } = useBuildingDetail();
  const { refresh, setError, setSuccess } = useParticularClientDetail();

  return (
    <BuildingSettingsCard
      building={building}
      onSaved={(updated) => {
        setBuilding(updated);
        void refresh();
      }}
      onError={(msg) => setError(msg || null)}
      onSuccess={(msg) => {
        setSuccess(msg);
        setError(null);
      }}
    />
  );
}
