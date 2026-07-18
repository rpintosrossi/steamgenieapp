'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { BuildingDetailProvider } from '../../buildings/[id]/BuildingDetailContext';
import { ParticularClientDetailProvider, useParticularClientDetail } from './ParticularClientDetailContext';
import { ParticularClientTabs } from './ParticularClientTabs';

function ParticularClientDetailShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { client, error, success, setError, setSuccess } = useParticularClientDetail();

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [pathname, setError, setSuccess]);

  const locationParts = [
    client.building.address ?? client.address,
    client.building.city,
    client.building.province,
  ].filter(Boolean);

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/clientes-particulares" className="back-link">
            ← Volver a clientes particulares
          </Link>
          <h1 className="page-title">{client.name}</h1>
          {locationParts.length > 0 ? (
            <p className="page-subtitle">{locationParts.join(' · ')}</p>
          ) : (
            <p className="page-subtitle">
              Gestioná datos de contacto, ubicación GPS y zonas del cliente.
            </p>
          )}
        </div>
      </div>

      <ParticularClientTabs clientId={client.id} />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      {children}
    </>
  );
}

function SiteBuildingProvider({ children }: { children: ReactNode }) {
  const { client } = useParticularClientDetail();
  return (
    <BuildingDetailProvider buildingId={client.buildingId}>
      {children}
    </BuildingDetailProvider>
  );
}

export default function ParticularClientDetailLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <ParticularClientDetailProvider clientId={params.id}>
      <ParticularClientDetailShell>
        <SiteBuildingProvider>{children}</SiteBuildingProvider>
      </ParticularClientDetailShell>
    </ParticularClientDetailProvider>
  );
}
