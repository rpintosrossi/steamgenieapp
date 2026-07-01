import Constants from 'expo-constants';

const PRODUCTION_API_URL = 'https://steamgenie.up.railway.app';

/** Base URL for API calls. Set EXPO_PUBLIC_API_URL at build time (EAS / .env). */
export function resolveApiBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  const raw =
    (typeof fromExtra === 'string' && fromExtra) ||
    process.env.EXPO_PUBLIC_API_URL ||
    (__DEV__ ? 'http://10.0.2.2:4000' : PRODUCTION_API_URL);
  const trimmed = raw.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

let cachedApiBaseUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (!cachedApiBaseUrl) {
    cachedApiBaseUrl = resolveApiBaseUrl();
  }
  return cachedApiBaseUrl;
}

/** @deprecated Use getApiBaseUrl() — kept for existing imports */
export const API_BASE_URL = getApiBaseUrl();
