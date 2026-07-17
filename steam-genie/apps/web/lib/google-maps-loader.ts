const SCRIPT_ID = 'sg-google-maps-js';

let loadPromise: Promise<typeof google.maps> | null = null;

export function getGoogleMapsBrowserKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

/** Carga el script de Maps JavaScript API (una sola vez). */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps solo puede cargarse en el navegador.'));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (loadPromise) return loadPromise;

  const apiKey = getGoogleMapsBrowserKey();
  if (!apiKey) {
    return Promise.reject(
      new Error(
        'Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Agregala en .env del web y reiniciá Next.',
      ),
    );
  }

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error('Google Maps no quedó disponible tras cargar el script.'));
      });
      existing.addEventListener('error', () =>
        reject(new Error('No se pudo cargar Google Maps JavaScript API.')),
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=es&region=AR&v=weekly`;
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps no quedó disponible tras cargar el script.'));
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('No se pudo cargar Google Maps JavaScript API.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
