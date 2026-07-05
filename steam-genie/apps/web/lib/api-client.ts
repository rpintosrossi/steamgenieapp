function parseConfiguredApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const trimmed = raw.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function extractPortFromUrl(url: string): string {
  try {
    const port = new URL(url).port;
    return port || '4000';
  } catch {
    return '4000';
  }
}

/** URL de la API según el host desde el que se abre el panel (soporta acceso por IP en la red local). */
export function getApiBaseUrl(): string {
  const configured = parseConfiguredApiUrl();

  if (typeof window === 'undefined') return configured;

  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return configured;

  const apiPort = process.env.NEXT_PUBLIC_API_PORT ?? extractPortFromUrl(configured);
  return `${protocol}//${hostname}:${apiPort}`;
}

/** @deprecated Usar getApiBaseUrl() — se mantiene por compatibilidad con imports existentes. */
export const API_BASE_URL_EXPORTED = getApiBaseUrl();

export function getAccessTokenForStream(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sg_access_token');
}

type FetchOptions = RequestInit & { skipAuth?: boolean; _retried?: boolean };

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sg_access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sg_refresh_token');
}

function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('sg_access_token', accessToken);
  localStorage.setItem('sg_refresh_token', refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem('sg_access_token');
  localStorage.removeItem('sg_refresh_token');
}

function extractErrorMessage(errBody: unknown, status: number, statusText: string): string {
  if (errBody && typeof errBody === 'object') {
    const body = errBody as Record<string, unknown>;
    const raw = body.message;
    if (Array.isArray(raw)) return raw.join(', ');
    if (typeof raw === 'string' && raw.length > 0) return raw;
  }

  if (status === 401) return 'Sesión expirada o no válida. Volvé a iniciar sesión.';
  if (status === 403) return 'No tenés permiso para realizar esta acción.';
  return statusText || 'Error en la solicitud';
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  saveTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function apiClient<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, _retried, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers ?? {}),
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (!token) {
      throw new Error('Sesión no iniciada. Volvé a iniciar sesión.');
    }
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (res.status === 401 && !skipAuth && !_retried) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiClient<T>(path, { ...options, _retried: true });
    }
    throw new Error('Sesión expirada. Volvé a iniciar sesión.');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(extractErrorMessage(errBody, res.status, res.statusText));
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: FetchOptions) =>
    apiClient<T>(path, { method: 'GET', ...opts }),
  post: <T>(path: string, body: unknown, opts?: FetchOptions) =>
    apiClient<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      ...opts,
    }),
  put: <T>(path: string, body: unknown, opts?: FetchOptions) =>
    apiClient<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...opts,
    }),
  patch: <T>(path: string, body: unknown, opts?: FetchOptions) =>
    apiClient<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      ...opts,
    }),
  delete: <T>(path: string, opts?: FetchOptions) =>
    apiClient<T>(path, { method: 'DELETE', ...opts }),
  upload: async <T>(path: string, file: File, opts?: FetchOptions): Promise<T> => {
    const { skipAuth, _retried, ...fetchOptions } = opts ?? {};

    const bytes = await file.arrayBuffer();
    const snapshot = new File([bytes], file.name, {
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified,
    });

    const send = async (retried: boolean): Promise<T> => {
      const formData = new FormData();
      formData.append('file', snapshot);

      const headers: HeadersInit = { ...(fetchOptions.headers ?? {}) };

      if (!skipAuth) {
        const token = getAccessToken();
        if (!token) {
          throw new Error('Sesión no iniciada. Volvé a iniciar sesión.');
        }
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        ...fetchOptions,
        method: 'POST',
        headers,
        body: formData,
      });

      if (res.status === 401 && !skipAuth && !retried) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          return send(true);
        }
        throw new Error('Sesión expirada. Volvé a iniciar sesión.');
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(errBody, res.status, res.statusText));
      }

      return res.json() as Promise<T>;
    };

    return send(Boolean(_retried));
  },
  download: async (path: string, filename: string, opts?: FetchOptions): Promise<void> => {
    const { skipAuth, _retried, ...fetchOptions } = opts ?? {};
    const headers: HeadersInit = { ...(fetchOptions.headers ?? {}) };

    if (!skipAuth) {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Sesión no iniciada. Volvé a iniciar sesión.');
      }
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...fetchOptions,
      method: 'GET',
      headers,
    });

    if (res.status === 401 && !skipAuth && !_retried) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return api.download(path, filename, { ...opts, _retried: true });
      }
      throw new Error('Sesión expirada. Volvé a iniciar sesión.');
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(extractErrorMessage(errBody, res.status, res.statusText));
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};
