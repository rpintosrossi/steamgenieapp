import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { getApiBaseUrl } from '../config/api';

export type AuthenticatedImageSource = {
  uri: string;
  headers: { Authorization: string };
};

/**
 * Fuente de Image con Authorization Bearer.
 * Acepta path relativo (`/stock-logistics/...`) o URL absoluta.
 */
export function useAuthenticatedImage(
  pathOrUrl: string | null | undefined,
): AuthenticatedImageSource | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void useAuthStore
      .getState()
      .ensureAccessToken()
      .then((t) => {
        if (!cancelled) setToken(t);
      });
    return () => {
      cancelled = true;
    };
  }, [pathOrUrl]);

  if (!pathOrUrl || !token) return null;

  const uri = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${getApiBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

  return {
    uri,
    headers: { Authorization: `Bearer ${token}` },
  };
}
