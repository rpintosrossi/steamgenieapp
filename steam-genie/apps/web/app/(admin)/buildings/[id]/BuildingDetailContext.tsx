'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../../../../lib/api-client';
import type { BuildingDetail } from '../../../../lib/types';

type BuildingDetailContextValue = {
  building: BuildingDetail;
  buildingId: string;
  error: string | null;
  success: string | null;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
  refresh: () => Promise<void>;
  setBuilding: (building: BuildingDetail) => void;
};

const BuildingDetailContext = createContext<BuildingDetailContextValue | null>(null);

export function useBuildingDetail() {
  const ctx = useContext(BuildingDetailContext);
  if (!ctx) {
    throw new Error('useBuildingDetail debe usarse dentro de BuildingDetailProvider');
  }
  return ctx;
}

type ProviderProps = {
  buildingId: string;
  children: ReactNode;
};

export function BuildingDetailProvider({ buildingId, children }: ProviderProps) {
  const [building, setBuilding] = useState<BuildingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<BuildingDetail>(`/buildings/${buildingId}`);
      setBuilding(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el edificio');
      setBuilding(null);
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<BuildingDetailContextValue | null>(() => {
    if (!building) return null;
    return {
      building,
      buildingId,
      error,
      success,
      setError,
      setSuccess,
      refresh,
      setBuilding,
    };
  }, [building, buildingId, error, success, refresh]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" role="status" aria-label="Cargando" />
        <p className="muted">Cargando edificio…</p>
      </div>
    );
  }

  if (!building || !value) {
    return <div className="alert alert-error">{error ?? 'Edificio no encontrado'}</div>;
  }

  return (
    <BuildingDetailContext.Provider value={value}>
      {children}
    </BuildingDetailContext.Provider>
  );
}
