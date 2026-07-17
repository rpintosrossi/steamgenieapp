'use client';

import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsBrowserKey, loadGoogleMaps } from '../lib/google-maps-loader';

const DEFAULT_CENTER = { lat: -34.6037, lng: -58.3816 };
const DEFAULT_ZOOM = 13;

type BuildingLocationMapProps = {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  /** Centro al que volar el mapa (p. ej. al elegir provincia/ciudad). */
  viewCenter?: { lat: number; lon: number } | null;
  viewZoom?: number;
  onPick: (lat: number, lng: number) => void;
  disabled?: boolean;
};

export function BuildingLocationMap({
  latitude,
  longitude,
  radiusM,
  viewCenter,
  viewZoom,
  onPick,
  disabled,
}: BuildingLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const onPickRef = useRef(onPick);
  const disabledRef = useRef(disabled);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  onPickRef.current = onPick;
  disabledRef.current = disabled;

  const hasMarker =
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  useEffect(() => {
    if (!getGoogleMapsBrowserKey()) {
      setError(
        'Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en el .env del web. Habilitá Maps JavaScript API y reiniciá Next.',
      );
      return;
    }

    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | null = null;

    void (async () => {
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const initialCenter = hasMarker
          ? { lat: latitude!, lng: longitude! }
          : viewCenter
            ? { lat: viewCenter.lat, lng: viewCenter.lon }
            : DEFAULT_CENTER;

        const map = new maps.Map(containerRef.current, {
          center: initialCenter,
          zoom: hasMarker || viewCenter ? DEFAULT_ZOOM : 5,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: disabled ? 'none' : 'auto',
        });

        mapRef.current = map;
        clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (disabledRef.current) return;
          const lat = e.latLng?.lat();
          const lng = e.latLng?.lng();
          if (lat == null || lng == null) return;
          onPickRef.current(lat, lng);
        });

        setReady(true);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo cargar Google Maps.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (clickListener) clickListener.remove();
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      mapRef.current = null;
      setReady(false);
    };
    // Solo montaje: el resto se actualiza en effects separados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setOptions({ gestureHandling: disabled ? 'none' : 'auto' });
  }, [disabled, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !viewCenter) return;
    map.panTo({ lat: viewCenter.lat, lng: viewCenter.lon });
    if (viewZoom != null) map.setZoom(viewZoom);
  }, [viewCenter, viewZoom, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.google?.maps) return;

    if (!hasMarker) {
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      return;
    }

    const position = { lat: latitude!, lng: longitude! };

    if (!markerRef.current) {
      const marker = new google.maps.Marker({
        map,
        position,
        draggable: !disabled,
        title: 'Ubicación del edificio',
      });
      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        if (!pos) return;
        onPickRef.current(pos.lat(), pos.lng());
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setPosition(position);
      markerRef.current.setDraggable(!disabled);
    }

    if (radiusM > 0) {
      if (!circleRef.current) {
        circleRef.current = new google.maps.Circle({
          map,
          center: position,
          radius: radiusM,
          strokeColor: '#2563eb',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          clickable: false,
        });
      } else {
        circleRef.current.setCenter(position);
        circleRef.current.setRadius(radiusM);
      }
    } else {
      circleRef.current?.setMap(null);
      circleRef.current = null;
    }

    map.panTo(position);
  }, [hasMarker, latitude, longitude, radiusM, disabled, ready]);

  return (
    <div className={`building-location-map${disabled ? ' is-disabled' : ''}`}>
      <div
        ref={containerRef}
        className="building-location-map-canvas"
        role="presentation"
      />
      {!ready && !error ? (
        <div className="building-location-map-overlay">Cargando Google Maps…</div>
      ) : null}
      {error ? <div className="building-location-map-overlay is-error">{error}</div> : null}
      <p className="building-location-map-hint">
        {disabled
          ? 'Activá la validación GPS para definir la ubicación en el mapa.'
          : 'Hacé clic en el mapa o arrastrá el marcador para ubicar el edificio.'}
      </p>
    </div>
  );
}
