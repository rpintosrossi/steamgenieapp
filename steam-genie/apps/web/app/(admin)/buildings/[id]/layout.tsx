'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { BuildingBulkImportModal } from '../../../../components/BuildingBulkImportModal';
import { BuildingDetailProvider, useBuildingDetail } from './BuildingDetailContext';
import { BuildingTabs } from './BuildingTabs';

function BuildingDetailShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { building, error, success, setError, setSuccess, refresh } = useBuildingDetail();
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [pathname, setError, setSuccess]);

  const locationParts = [building.address, building.city, building.province].filter(Boolean);
  const isZonas = pathname.includes(`/buildings/${building.id}/zonas`);

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/buildings" className="back-link">← Volver a edificios</Link>
          <h1 className="page-title">{building.name}</h1>
          {locationParts.length > 0 ? (
            <p className="page-subtitle">{locationParts.join(' · ')}</p>
          ) : (
            <p className="page-subtitle">Gestioná la configuración, zonas y usuarios de este edificio.</p>
          )}
        </div>
        <div className="page-header-actions">
          {isZonas ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setImportOpen(true)}
            >
              Importar Excel
            </button>
          ) : null}
          <Link href="/tasks" className="btn btn-secondary btn-sm">
            Ver tareas
          </Link>
        </div>
      </div>

      <BuildingTabs buildingId={building.id} />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      {children}

      {importOpen ? (
        <BuildingBulkImportModal
          buildingId={building.id}
          buildingName={building.name}
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            setSuccess('Importación completada. La estructura se actualizó.');
            setError(null);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}

export default function BuildingDetailLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <BuildingDetailProvider buildingId={params.id}>
      <BuildingDetailShell>{children}</BuildingDetailShell>
    </BuildingDetailProvider>
  );
}
