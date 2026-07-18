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
import type { ParticularClientItem } from '../../../../lib/types';

type ParticularClientDetailContextValue = {
  client: ParticularClientItem;
  clientId: string;
  error: string | null;
  success: string | null;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
  refresh: () => Promise<void>;
  setClient: (client: ParticularClientItem) => void;
};

const ParticularClientDetailContext =
  createContext<ParticularClientDetailContextValue | null>(null);

export function useParticularClientDetail() {
  const ctx = useContext(ParticularClientDetailContext);
  if (!ctx) {
    throw new Error(
      'useParticularClientDetail debe usarse dentro de ParticularClientDetailProvider',
    );
  }
  return ctx;
}

type ProviderProps = {
  clientId: string;
  children: ReactNode;
};

export function ParticularClientDetailProvider({ clientId, children }: ProviderProps) {
  const [client, setClient] = useState<ParticularClientItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ParticularClientItem>(`/particular-clients/${clientId}`);
      setClient(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el cliente');
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ParticularClientDetailContextValue | null>(() => {
    if (!client) return null;
    return {
      client,
      clientId,
      error,
      success,
      setError,
      setSuccess,
      refresh,
      setClient,
    };
  }, [client, clientId, error, success, refresh]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" role="status" aria-label="Cargando" />
        <p className="muted">Cargando cliente…</p>
      </div>
    );
  }

  if (!client || !value) {
    return <div className="alert alert-error">{error ?? 'Cliente no encontrado'}</div>;
  }

  return (
    <ParticularClientDetailContext.Provider value={value}>
      {children}
    </ParticularClientDetailContext.Provider>
  );
}
