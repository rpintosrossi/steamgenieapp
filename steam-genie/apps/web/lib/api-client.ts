const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sg_access_token');
}

type FetchOptions = RequestInit & { skipAuth?: boolean };

export async function apiClient<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers ?? {}),
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'Request failed');
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
};
