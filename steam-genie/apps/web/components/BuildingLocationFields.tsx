'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  fetchArgentinaLocalities,
  fetchArgentinaProvinces,
  findLocalityByName,
  findProvinceByName,
  type ArgentinaCentroide,
  type ArgentinaLocality,
  type ArgentinaProvince,
} from '../lib/argentina-georef';
import {
  resolveGooglePlace,
  searchGoogleAddresses,
  type GoogleAddressSuggestion,
} from '../lib/google-address-search';

const BuildingLocationMap = dynamic(
  () =>
    import('./BuildingLocationMap').then((m) => m.BuildingLocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="building-location-map-loading">Cargando mapa…</div>
    ),
  },
);

export type BuildingLocationFieldsValue = {
  address: string;
  province: string;
  city: string;
  latitude: string;
  longitude: string;
  gpsRadiusM: string;
  requireGpsValidation: boolean;
};

type BuildingLocationFieldsProps = {
  value: BuildingLocationFieldsValue;
  onChange: (patch: Partial<BuildingLocationFieldsValue>) => void;
  showActiveToggle?: boolean;
  isActive?: boolean;
  onActiveChange?: (active: boolean) => void;
};

function parseCoord(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

export function BuildingLocationFields({
  value,
  onChange,
  showActiveToggle,
  isActive,
  onActiveChange,
}: BuildingLocationFieldsProps) {
  const [provinces, setProvinces] = useState<ArgentinaProvince[]>([]);
  const [localities, setLocalities] = useState<ArgentinaLocality[]>([]);
  const [viewCenter, setViewCenter] = useState<ArgentinaCentroide | null>(null);
  const [viewZoom, setViewZoom] = useState<number | undefined>(undefined);

  const [suggestions, setSuggestions] = useState<GoogleAddressSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const addressWrapRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  /** Dirección aplicada desde una sugerencia; no rebuscar hasta que el usuario edite. */
  const appliedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchArgentinaProvinces();
      if (cancelled) return;
      setProvinces(list);

      const matched = findProvinceByName(list, value.province);
      if (matched) {
        if (matched.name !== value.province) {
          onChange({ province: matched.name });
        }
        const locs = await fetchArgentinaLocalities(matched.id);
        if (cancelled) return;
        setLocalities(locs);
        if (value.address.trim()) {
          appliedAddressRef.current = value.address.trim();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (!addressWrapRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectedProvince = useMemo(
    () => findProvinceByName(provinces, value.province),
    [provinces, value.province],
  );

  const loadLocalities = useCallback(async (provinceId: string) => {
    const locs = await fetchArgentinaLocalities(provinceId);
    setLocalities(locs);
    return locs;
  }, []);

  useEffect(() => {
    const query = value.address.trim();

    if (appliedAddressRef.current != null && appliedAddressRef.current === query) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearchingAddress(false);
      setActiveSuggestion(-1);
      return;
    }

    if (query.length < 3) {
      setSuggestions([]);
      setSearchingAddress(false);
      setShowSuggestions(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearchingAddress(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const bias = selectedProvince?.centroide;
        const results = await searchGoogleAddresses(query, {
          biasLat: bias?.lat,
          biasLon: bias?.lon,
        });
        if (seq !== searchSeq.current) return;
        setSuggestions(results);
        setSearchingAddress(false);
        setActiveSuggestion(-1);
        setShowSuggestions(true);
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [value.address, selectedProvince?.centroide?.lat, selectedProvince?.centroide?.lon]);

  async function applyAddressSuggestion(item: GoogleAddressSuggestion) {
    searchSeq.current += 1;
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveSuggestion(-1);
    setSearchingAddress(false);
    setResolvingPlace(true);

    try {
      const place = await resolveGooglePlace(item.placeId);
      if (!place) return;

      const province = findProvinceByName(provinces, place.province);

      let locs = localities;
      if (province) {
        locs = await loadLocalities(province.id);
      }

      let nextCity = '';
      if (province?.id === '02') {
        nextCity = locs[0]?.name ?? 'Ciudad Autónoma de Buenos Aires';
      } else {
        const cityMatch = findLocalityByName(locs, place.city);
        nextCity = cityMatch?.name ?? place.city?.trim() ?? '';
      }

      const nextAddress = place.streetLine || item.mainText;
      appliedAddressRef.current = nextAddress.trim();
      setViewCenter({ lat: place.lat, lon: place.lon });
      setViewZoom(17);

      onChange({
        address: nextAddress,
        province: province?.name ?? place.province ?? '',
        city: nextCity,
        latitude: place.lat.toFixed(7),
        longitude: place.lon.toFixed(7),
      });
    } finally {
      setResolvingPlace(false);
    }
  }

  function handleMapPick(lat: number, lng: number) {
    onChange({
      latitude: lat.toFixed(7),
      longitude: lng.toFixed(7),
    });
  }

  function handleAddressKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      void applyAddressSuggestion(suggestions[activeSuggestion]);
      return;
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  const lat = parseCoord(value.latitude);
  const lng = parseCoord(value.longitude);
  const radius = Number(value.gpsRadiusM) || 0;

  return (
    <div className="stack building-location-fields">
      <div className="form-field address-autocomplete" ref={addressWrapRef}>
        <label>Dirección</label>
        <input
          value={value.address}
          onChange={(e) => {
            appliedAddressRef.current = null;
            onChange({
              address: e.target.value,
              province: '',
              city: '',
              latitude: '',
              longitude: '',
            });
            setLocalities([]);
            setShowSuggestions(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onKeyDown={handleAddressKeyDown}
          placeholder="Ej: Av. Corrientes 1234"
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
        />
        {searchingAddress || resolvingPlace ? (
          <p className="muted address-autocomplete-status">
            {resolvingPlace ? 'Ubicando dirección…' : 'Buscando direcciones…'}
          </p>
        ) : null}
        {showSuggestions &&
        value.address.trim().length >= 3 &&
        !searchingAddress &&
        !resolvingPlace ? (
          <ul className="address-autocomplete-list" role="listbox">
            {suggestions.length === 0 ? (
              <li className="address-autocomplete-empty">No se encontraron direcciones</li>
            ) : (
              suggestions.map((item, index) => (
                <li key={item.placeId}>
                  <button
                    type="button"
                    className={`address-autocomplete-item${
                      index === activeSuggestion ? ' is-active' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void applyAddressSuggestion(item)}
                    role="option"
                    aria-selected={index === activeSuggestion}
                  >
                    <span className="address-autocomplete-item-title">{item.mainText}</span>
                    <span className="address-autocomplete-item-meta">
                      {item.secondaryText || item.label}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Elegí una dirección del listado: provincia, ciudad y mapa se completan solos.
        </p>
      </div>

      <div className="grid-2">
        <div className="form-field">
          <label>Provincia</label>
          <input
            value={value.province}
            readOnly
            placeholder="Se completa al elegir la dirección"
          />
        </div>

        <div className="form-field">
          <label>Ciudad / municipio</label>
          <input
            value={value.city}
            readOnly
            placeholder="Se completa al elegir la dirección"
          />
        </div>
      </div>

      <div className="form-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={value.requireGpsValidation}
            onChange={(e) => onChange({ requireGpsValidation: e.target.checked })}
          />
          Validar ubicación GPS al fichar
        </label>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Si está activo, la persona debe estar dentro del radio marcado en el mapa para fichar
          entrada o salida.
        </p>
      </div>

      <div className="form-field">
        <label>Ubicación en el mapa{value.requireGpsValidation ? ' *' : ''}</label>
        <BuildingLocationMap
          latitude={lat}
          longitude={lng}
          radiusM={radius > 0 ? radius : 200}
          viewCenter={viewCenter}
          viewZoom={viewZoom}
          onPick={handleMapPick}
        />
      </div>

      <div className="grid-3">
        <div className="form-field">
          <label>Latitud</label>
          <input value={value.latitude} readOnly placeholder="Seleccioná en el mapa" />
        </div>
        <div className="form-field">
          <label>Longitud</label>
          <input value={value.longitude} readOnly placeholder="Seleccioná en el mapa" />
        </div>
        <div className="form-field">
          <label>Radio GPS (m)</label>
          <input
            value={value.gpsRadiusM}
            onChange={(e) => onChange({ gpsRadiusM: e.target.value })}
            placeholder="200"
            inputMode="numeric"
            disabled={!value.requireGpsValidation}
          />
        </div>
      </div>

      {showActiveToggle ? (
        <div className="form-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isActive !== false}
              onChange={(e) => onActiveChange?.(e.target.checked)}
            />
            Edificio activo
          </label>
        </div>
      ) : null}
    </div>
  );
}
