/** Base URL for API calls. Set EXPO_PUBLIC_API_URL at build time (EAS / .env). */
export function resolveApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';
  const trimmed = raw.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const API_BASE_URL = resolveApiBaseUrl();
