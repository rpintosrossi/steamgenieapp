import { Injectable, Logger } from '@nestjs/common';

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

type AutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
  error?: { message?: string; status?: string };
};

type PlaceDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  error?: { message?: string; status?: string };
};

type GeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    place_id?: string;
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
  }>;
};

@Injectable()
export class GoogleGeocodingService {
  private readonly logger = new Logger(GoogleGeocodingService.name);

  private getApiKey(): string | null {
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    return key || null;
  }

  async autocomplete(
    input: string,
    options?: {
      sessionToken?: string;
      biasLat?: number;
      biasLon?: number;
      max?: number;
    },
  ): Promise<GoogleAddressSuggestion[]> {
    const trimmed = input.trim();
    if (trimmed.length < 3) return [];

    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY no configurada; autocomplete deshabilitado.');
      return [];
    }
    const body: Record<string, unknown> = {
      input: trimmed,
      languageCode: 'es',
      regionCode: 'AR',
      includedRegionCodes: ['ar'],
    };

    if (options?.sessionToken) {
      body.sessionToken = options.sessionToken;
    }

    if (
      options?.biasLat != null &&
      options?.biasLon != null &&
      Number.isFinite(options.biasLat) &&
      Number.isFinite(options.biasLon)
    ) {
      body.locationBias = {
        circle: {
          center: {
            latitude: options.biasLat,
            longitude: options.biasLon,
          },
          radius: 50_000,
        },
      };
    }

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as AutocompleteResponse;
      if (!res.ok) {
        this.logger.warn(
          `Places Autocomplete HTTP ${res.status}: ${json.error?.message ?? res.statusText}`,
        );
        return [];
      }

      const max = options?.max ?? 8;
      return (json.suggestions ?? [])
        .map((s) => {
          const p = s.placePrediction;
          if (!p?.placeId) return null;
          const mainText =
            p.structuredFormat?.mainText?.text?.trim() ||
            p.text?.text?.trim() ||
            trimmed;
          const secondaryText = p.structuredFormat?.secondaryText?.text?.trim() || '';
          const label = p.text?.text?.trim() || [mainText, secondaryText].filter(Boolean).join(', ');
          return {
            placeId: p.placeId,
            label,
            mainText,
            secondaryText,
          } satisfies GoogleAddressSuggestion;
        })
        .filter((item): item is GoogleAddressSuggestion => item != null)
        .slice(0, max);
    } catch (e) {
      this.logger.warn(
        `Places Autocomplete error: ${e instanceof Error ? e.message : String(e)}`,
      );
      return [];
    }
  }

  async placeDetails(
    placeId: string,
    options?: { sessionToken?: string },
  ): Promise<GoogleGeocodedAddress | null> {
    const id = placeId.trim();
    if (!id) return null;

    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY no configurada; place details deshabilitado.');
      return null;
    }
    const params = new URLSearchParams({ languageCode: 'es', regionCode: 'AR' });
    if (options?.sessionToken) {
      params.set('sessionToken', options.sessionToken);
    }

    const resourceName = id.startsWith('places/') ? id : `places/${id}`;

    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/${resourceName}?${params.toString()}`,
        {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'id,formattedAddress,shortFormattedAddress,location,addressComponents',
          },
        },
      );

      const json = (await res.json()) as PlaceDetailsResponse;
      if (!res.ok) {
        this.logger.warn(
          `Place Details HTTP ${res.status}: ${json.error?.message ?? res.statusText}`,
        );
        return null;
      }

      const lat = json.location?.latitude;
      const lon = json.location?.longitude;
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      const components = json.addressComponents ?? [];
      const route = componentLongText(components, 'route');
      const streetNumber = componentLongText(components, 'street_number');
      const streetLine =
        [route, streetNumber].filter(Boolean).join(' ').trim() ||
        json.shortFormattedAddress?.trim() ||
        json.formattedAddress?.trim() ||
        '';

      const province =
        componentLongText(components, 'administrative_area_level_1') || undefined;
      // En Argentina el partido/municipio suele venir en level_2; locality a veces es barrio o falta.
      const city =
        componentLongText(components, 'administrative_area_level_2') ||
        componentLongText(components, 'locality') ||
        componentLongText(components, 'postal_town') ||
        componentLongText(components, 'sublocality_level_1') ||
        componentLongText(components, 'sublocality') ||
        undefined;

      return {
        lat,
        lon,
        address: json.formattedAddress?.trim() || streetLine,
        streetLine,
        city,
        province,
        placeId: json.id?.replace(/^places\//, '') || id.replace(/^places\//, ''),
      };
    } catch (e) {
      this.logger.warn(`Place Details error: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  async geocodeAddress(
    address: string,
    province?: string,
    city?: string,
  ): Promise<GoogleGeocodedAddress | null> {
    const queryParts = [address, city, province, 'Argentina'].filter(Boolean);
    const query = queryParts.join(', ').trim();
    if (query.length < 3) return null;

    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY no configurada; geocoding deshabilitado.');
      return null;
    }
    const params = new URLSearchParams({
      address: query,
      language: 'es',
      region: 'ar',
      components: 'country:AR',
      key: apiKey,
    });

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      );
      if (!res.ok) {
        this.logger.warn(`Geocoding HTTP ${res.status}`);
        return null;
      }

      const json = (await res.json()) as GeocodeResponse;
      if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
        this.logger.warn(
          `Geocoding status ${json.status}: ${json.error_message ?? ''}`.trim(),
        );
      }

      const first = json.results?.[0];
      if (!first) return null;

      const lat = first.geometry?.location?.lat;
      const lon = first.geometry?.location?.lng;
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      const components = first.address_components ?? [];
      const route = legacyComponent(components, 'route');
      const streetNumber = legacyComponent(components, 'street_number');
      const streetLine =
        [route, streetNumber].filter(Boolean).join(' ').trim() ||
        first.formatted_address?.trim() ||
        address;

      return {
        lat,
        lon,
        address: first.formatted_address?.trim() || streetLine,
        streetLine,
        city:
          legacyComponent(components, 'locality') ||
          legacyComponent(components, 'administrative_area_level_2') ||
          city,
        province: legacyComponent(components, 'administrative_area_level_1') || province,
        placeId: first.place_id,
      };
    } catch (e) {
      this.logger.warn(`Geocoding error: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}

function componentLongText(
  components: Array<{ longText?: string; types?: string[] }>,
  type: string,
): string | undefined {
  const match = components.find((c) => c.types?.includes(type));
  return match?.longText?.trim() || undefined;
}

function legacyComponent(
  components: Array<{ long_name?: string; types?: string[] }>,
  type: string,
): string | undefined {
  const match = components.find((c) => c.types?.includes(type));
  return match?.long_name?.trim() || undefined;
}
