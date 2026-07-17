import { api } from './api-client';

export type GoogleAddressSuggestion = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
};

export type GoogleGeocodedAddress = {
  lat: number;
  lon: number;
  address: string;
  streetLine: string;
  city?: string;
  province?: string;
  placeId?: string;
};

function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Token de sesión de Places (agrupa autocomplete + place details para facturación). */
let activeSessionToken: string | null = null;

export function beginAddressSearchSession(): string {
  activeSessionToken = newSessionToken();
  return activeSessionToken;
}

export function getAddressSearchSessionToken(): string {
  if (!activeSessionToken) {
    return beginAddressSearchSession();
  }
  return activeSessionToken;
}

export function endAddressSearchSession(): void {
  activeSessionToken = null;
}

export async function searchGoogleAddresses(
  query: string,
  options?: { biasLat?: number; biasLon?: number },
): Promise<GoogleAddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    sessionToken: getAddressSearchSessionToken(),
  });
  if (options?.biasLat != null && Number.isFinite(options.biasLat)) {
    params.set('biasLat', String(options.biasLat));
  }
  if (options?.biasLon != null && Number.isFinite(options.biasLon)) {
    params.set('biasLon', String(options.biasLon));
  }

  try {
    return await api.get<GoogleAddressSuggestion[]>(
      `/geocoding/autocomplete?${params.toString()}`,
    );
  } catch {
    return [];
  }
}

export async function resolveGooglePlace(
  placeId: string,
): Promise<GoogleGeocodedAddress | null> {
  const params = new URLSearchParams({
    placeId,
    sessionToken: getAddressSearchSessionToken(),
  });

  try {
    const result = await api.get<GoogleGeocodedAddress | null>(
      `/geocoding/place?${params.toString()}`,
    );
    endAddressSearchSession();
    return result;
  } catch {
    endAddressSearchSession();
    return null;
  }
}
