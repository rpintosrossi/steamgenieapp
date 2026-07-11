'use client';

import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: [number, number] = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 13;

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

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

function MapClickHandler({
  onPick,
  disabled,
}: {
  onPick: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapViewController({
  viewCenter,
  viewZoom,
  marker,
}: {
  viewCenter?: { lat: number; lon: number } | null;
  viewZoom?: number;
  marker: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!viewCenter) return;
    map.flyTo([viewCenter.lat, viewCenter.lon], viewZoom ?? map.getZoom(), {
      duration: 0.6,
    });
  }, [map, viewCenter, viewZoom]);

  useEffect(() => {
    if (!marker) return;
    // Asegurar que el marcador quede visible sin pisar un flyTo reciente de provincia.
  }, [marker]);

  return null;
}

export function BuildingLocationMap({
  latitude,
  longitude,
  radiusM,
  viewCenter,
  viewZoom,
  onPick,
  disabled,
}: BuildingLocationMapProps) {
  const hasMarker = latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const center: [number, number] = hasMarker
    ? [latitude!, longitude!]
    : viewCenter
      ? [viewCenter.lat, viewCenter.lon]
      : DEFAULT_CENTER;

  return (
    <div className={`building-location-map${disabled ? ' is-disabled' : ''}`}>
      <MapContainer
        center={center}
        zoom={hasMarker || viewCenter ? DEFAULT_ZOOM : 5}
        scrollWheelZoom={!disabled}
        style={{ height: '100%', width: '100%', borderRadius: 10 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onPick={onPick} disabled={disabled} />
        <MapViewController
          viewCenter={viewCenter}
          viewZoom={viewZoom}
          marker={hasMarker ? { lat: latitude!, lng: longitude! } : null}
        />
        {hasMarker ? (
          <>
            <Marker
              position={[latitude!, longitude!]}
              icon={markerIcon}
              draggable={!disabled}
              eventHandlers={{
                dragend: (e) => {
                  const pos = e.target.getLatLng();
                  onPick(pos.lat, pos.lng);
                },
              }}
            />
            {radiusM > 0 ? (
              <Circle
                center={[latitude!, longitude!]}
                radius={radiusM}
                pathOptions={{
                  color: '#2563eb',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              />
            ) : null}
          </>
        ) : null}
      </MapContainer>
      <p className="building-location-map-hint">
        {disabled
          ? 'Activá la validación GPS para definir la ubicación en el mapa.'
          : 'Hacé clic en el mapa o arrastrá el marcador para ubicar el edificio.'}
      </p>
    </div>
  );
}
