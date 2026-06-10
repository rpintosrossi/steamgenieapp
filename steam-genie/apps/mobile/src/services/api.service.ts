import { useAuthStore } from '../stores/auth.store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

// ─── Types that match the actual backend responses ────────────────────────────

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    await useAuthStore.getState().logout();
    throw new Error('Sesión expirada. Iniciá sesión nuevamente.');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    const msg = Array.isArray(errBody.message)
      ? errBody.message.join(', ')
      : (errBody.message ?? 'Error desconocido');
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

// ─── Multipart upload ─────────────────────────────────────────────────────────

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const accessToken = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      // Do NOT set Content-Type — let fetch set multipart boundary automatically
    },
    body: formData,
  });

  if (res.status === 401) {
    await useAuthStore.getState().logout();
    throw new Error('Sesión expirada. Iniciá sesión nuevamente.');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    const msg = Array.isArray(errBody.message)
      ? errBody.message.join(', ')
      : (errBody.message ?? 'Error desconocido');
    throw new Error(msg);
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
