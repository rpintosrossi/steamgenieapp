import { useAuthStore } from '../stores/auth.store';
import { API_BASE_URL } from '../config/api';
// ─── Types that match the actual backend responses ────────────────────────────

export interface ApiError {
  statusCode: number;
  message: string | string[] | Record<string, unknown>;
  error?: string;
}

type RequestOptions = RequestInit & { _retried?: boolean; skipAuth?: boolean };

function extractErrorMessage(errBody: unknown, fallback: string): string {
  if (!errBody || typeof errBody !== 'object') return fallback;

  const body = errBody as Record<string, unknown>;
  const raw = body.message;

  // Nest HttpExceptionFilter may nest getResponse() inside message
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested = raw as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
    if (Array.isArray(nested.message)) return nested.message.join(', ');
  }

  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'string') return raw;

  return fallback;
}

async function buildAuthHeaders(skipAuth?: boolean): Promise<HeadersInit> {
  if (skipAuth) return { 'Content-Type': 'application/json' };

  const token = await useAuthStore.getState().ensureAccessToken();
  if (!token) {
    throw new Error('Sesión no iniciada. Volvé a iniciar sesión.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { _retried, skipAuth, ...fetchOptions } = options;

  const headers = await buildAuthHeaders(skipAuth);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: {
        ...headers,
        ...(fetchOptions.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Network request failed';
    throw new Error(message);
  }

  if (res.status === 401 && !skipAuth && !_retried) {
    const newToken = await useAuthStore.getState().refreshTokens();
    if (newToken) {
      return request<T>(path, { ...options, _retried: true });
    }
    throw new Error('Sesión expirada. Volvé a iniciar sesión.');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(extractErrorMessage(errBody, res.statusText || 'Error desconocido'));
  }

  return res.json() as Promise<T>;
}

// ─── Multipart upload ─────────────────────────────────────────────────────────

async function requestMultipart<T>(
  path: string,
  formData: FormData,
  retried = false,
): Promise<T> {
  const token = await useAuthStore.getState().ensureAccessToken();
  if (!token) {
    throw new Error('Sesión no iniciada. Volvé a iniciar sesión.');
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (res.status === 401 && !retried) {
    const newToken = await useAuthStore.getState().refreshTokens();
    if (newToken) {
      return requestMultipart<T>(path, formData, true);
    }
    throw new Error('Sesión expirada. Volvé a iniciar sesión.');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(extractErrorMessage(errBody, res.statusText || 'Error desconocido'));
  }

  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const apiService = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postMultipart: <T>(path: string, formData: FormData) =>
    requestMultipart<T>(path, formData),
  getBaseUrl: () => API_BASE_URL,
};
