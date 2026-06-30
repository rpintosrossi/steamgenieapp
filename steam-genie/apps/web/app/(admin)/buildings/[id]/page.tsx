'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BuildingBulkImportModal } from '../../../../components/BuildingBulkImportModal';
import { BuildingHierarchyManager } from '../../../../components/BuildingHierarchyManager';
import { api } from '../../../../lib/api-client';
import type { BuildingDetail } from '../../../../lib/types';

export default function BuildingDetailPage() {
  const params = useParams<{ id: string }>();
  const buildingId = params.id;

  const [building, setBuilding] = useState<BuildingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<BuildingDetail>(`/buildings/${buildingId}`);
      setBuilding(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el edificio');
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" role="status" aria-label="Cargando" />
        <p className="muted">Cargando edificio…</p>
      </div>
    );
  }

  if (!building) {
    return <div className="alert alert-error">{error ?? 'Edificio no encontrado'}</div>;
  }

  const locationParts = [building.address, building.city, building.province].filter(Boolean);

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/buildings" className="back-link">← Volver a edificios</Link>
          <h1 className="page-title">{building.name}</h1>
          {locationParts.length > 0 ? (
            <p className="page-subtitle">{locationParts.join(' · ')}</p>
          ) : (
            <p className="page-subtitle">Gestioná plantas, zonas y subzonas de este edificio.</p>
          )}
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setImportOpen(true)}
          >
            Importar Excel
          </button>
          <Link href="/tasks" className="btn btn-secondary btn-sm">
            Ver tareas
          </Link>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <BuildingHierarchyManager
        building={building}
        onRefresh={load}
        onError={(msg) => setError(msg || null)}
        onSuccess={(msg) => {
          setSuccess(msg);
          setError(null);
        }}
      />

      {importOpen ? (
        <BuildingBulkImportModal
          buildingId={building.id}
          buildingName={building.name}
          onClose={() => setImportOpen(false)}
          onSuccess={() => {
            setSuccess('Importación completada. La estructura se actualizó.');
            setError(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
