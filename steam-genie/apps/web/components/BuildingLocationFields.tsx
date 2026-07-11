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
  findProvinceByName,
  searchArgentinaAddresses,
  type ArgentinaAddressSuggestion,
  type ArgentinaCentroide,
  type ArgentinaLocality,
  type ArgentinaProvince,
} from '../lib/argentina-georef';

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
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [viewCenter, setViewCenter] = useState<ArgentinaCentroide | null>(null);
  const [viewZoom, setViewZoom] = useState<number | undefined>(undefined);
  const [cityManual, setCityManual] = useState(false);

  const [suggestions, setSuggestions] = useState<ArgentinaAddressSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const addressWrapRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);

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
        const cityKnown = locs.some(
          (l) => l.name.toLowerCase() === value.city.trim().toLowerCase(),
        );
        setCityManual(Boolean(value.city) && !cityKnown);
      } else if (value.city) {
        setCityManual(true);
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
    setLoadingLocalities(true);
    try {
      const locs = await fetchArgentinaLocalities(provinceId);
      setLocalities(locs);
      return locs;
    } finally {
      setLoadingLocalities(false);
    }
  }, []);

  useEffect(() => {
    const query = value.address.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSearchingAddress(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearchingAddress(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const results = await searchArgentinaAddresses(query, {
          provinceId: selectedProvince?.id,
          max: 8,
        });
        if (seq !== searchSeq.current) return;
        setSuggestions(results);
        setSearchingAddress(false);
        setActiveSuggestion(-1);
        setShowSuggestions(true);
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [value.address, selectedProvince?.id]);

  async function handleProvinceChange(name: string) {
    onChange({ province: name, city: '' });
    setCityManual(false);
    setLocalities([]);

    const province = provinces.find((p) => p.name === name);
    if (!province) {
      setViewCenter(null);
      return;
    }

    setViewCenter(province.centroide);
    setViewZoom(8);
    await loadLocalities(province.id);
  }

  function handleCityChange(name: string) {
    if (name === '__manual__') {
      setCityManual(true);
      onChange({ city: '' });
      return;
    }
    setCityManual(false);
    const locality = localities.find((l) => l.name === name);
    if (locality?.centroide && (!value.latitude.trim() || !value.longitude.trim())) {
      setViewCenter(locality.centroide);
      setViewZoom(14);
      onChange({
        city: name,
        latitude: String(locality.centroide.lat),
        longitude: String(locality.centroide.lon),
      });
      return;
    }
    onChange({ city: name });
    if (locality?.centroide) {
      setViewCenter(locality.centroide);
      setViewZoom(14);
    }
  }

  async function applyAddressSuggestion(item: ArgentinaAddressSuggestion) {
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveSuggestion(-1);

    const province =
      findProvinceByName(provinces, item.provinceName) ??
      provinces.find((p) => p.id === item.provinceId);

    let locs = localities;
    if (province) {
      locs = await loadLocalities(province.id);
    }

    const cityMatch =
      locs.find((l) => l.name.toLowerCase() === item.cityName.toLowerCase()) ??
      locs.find((l) => item.cityName.toLowerCase().includes(l.name.toLowerCase())) ??
      locs.find((l) => l.name.toLowerCase().includes(item.cityName.toLowerCase()));

    const nextCity = cityMatch?.name ?? item.cityName;
    setCityManual(Boolean(nextCity) && !cityMatch);

    setViewCenter({ lat: item.lat, lon: item.lon });
    setViewZoom(17);

    onChange({
      address: item.streetLine,
      province: province?.name ?? item.provinceName,
      city: nextCity,
      latitude: item.lat.toFixed(7),
      longitude: item.lon.toFixed(7),
    });
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
            onChange({ address: e.target.value });
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
        {searchingAddress ? (
          <p className="muted address-autocomplete-status">Buscando direcciones…</p>
        ) : null}
        {showSuggestions && value.address.trim().length >= 3 && !searchingAddress ? (
          <ul className="address-autocomplete-list" role="listbox">
            {suggestions.length === 0 ? (
              <li className="address-autocomplete-empty">No se encontraron direcciones</li>
            ) : (
              suggestions.map((item, index) => (
                <li key={item.id}>
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
                    <span className="address-autocomplete-item-title">{item.streetLine}</span>
                    <span className="address-autocomplete-item-meta">{item.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Escribí la dirección y elegí una opción del listado para ubicarla en el mapa.
        </p>
      </div>

      <div className="grid-2">
        <div className="form-field">
          <label>Provincia</label>
          <select
            value={value.province}
            onChange={(e) => void handleProvinceChange(e.target.value)}
          >
            <option value="">Seleccionar provincia</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>Ciudad / municipio</label>
          {cityManual || (!loadingLocalities && localities.length === 0 && selectedProvince) ? (
            <input
              value={value.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="Nombre de la ciudad"
            />
          ) : (
            <select
              value={value.city}
              onChange={(e) => handleCityChange(e.target.value)}
              disabled={!selectedProvince || loadingLocalities}
            >
              <option value="">
                {loadingLocalities
                  ? 'Cargando…'
                  : selectedProvince
                    ? 'Seleccionar ciudad'
                    : 'Elegí una provincia primero'}
              </option>
              {localities.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
              <option value="__manual__">Otra (escribir manualmente)…</option>
            </select>
          )}
          {cityManual ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => {
                setCityManual(false);
                onChange({ city: '' });
              }}
              disabled={!selectedProvince}
            >
              Volver al listado
            </button>
          ) : null}
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
