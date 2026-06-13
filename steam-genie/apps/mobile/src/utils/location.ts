import * as Location from 'expo-location';

const RECENT_LAST_KNOWN_MS = 60_000;
const FALLBACK_LAST_KNOWN_MS = 15 * 60 * 1000;
const POSITION_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('GPS timeout')), ms),
    ),
  ]);
}

function toCoords(location: Location.LocationObject): { gpsLat: number; gpsLng: number } {
  return {
    gpsLat: location.coords.latitude,
    gpsLng: location.coords.longitude,
  };
}

/** Obtiene GPS para fichaje: permisos, servicios activos, reintentos y fallback. */
export async function getRequiredGpsPosition(): Promise<{ gpsLat: number; gpsLng: number }> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error(
      'La ubicación del teléfono está desactivada. Activá el GPS en Configuración e intentá de nuevo.',
    );
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error(
      'GPS obligatorio. Habilitá los permisos de ubicación para Steam Genie en Configuración.',
    );
  }

  const lastKnown = await Location.getLastKnownPositionAsync();
  if (lastKnown && Date.now() - lastKnown.timestamp < RECENT_LAST_KNOWN_MS) {
    return toCoords(lastKnown);
  }

  const accuracyLevels = [Location.Accuracy.Balanced, Location.Accuracy.Low];
  for (const accuracy of accuracyLevels) {
    try {
      const location = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy,
          mayShowUserSettingsDialog: true,
        }),
        POSITION_TIMEOUT_MS,
      );
      return toCoords(location);
    } catch {
      // Reintentar con menor precisión o fallback.
    }
  }

  if (lastKnown && Date.now() - lastKnown.timestamp < FALLBACK_LAST_KNOWN_MS) {
    return toCoords(lastKnown);
  }

  throw new Error(
    'No pudimos obtener tu ubicación. Activá el GPS, salí al exterior unos segundos e intentá de nuevo.',
  );
}
