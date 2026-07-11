/** Provincias y localidades de Argentina vía API Georef (datos.gob.ar). */

export type ArgentinaCentroide = {
  lat: number;
  lon: number;
};

export type ArgentinaProvince = {
  id: string;
  name: string;
  centroide: ArgentinaCentroide;
};

export type ArgentinaLocality = {
  id: string;
  name: string;
  centroide: ArgentinaCentroide | null;
};

const GEOREF_BASE = 'https://apis.datos.gob.ar/georef/api';

/** Fallback offline (orden alfabético). Centroides aproximados de capitales. */
export const ARGENTINA_PROVINCES_FALLBACK: ArgentinaProvince[] = [
  { id: '06', name: 'Buenos Aires', centroide: { lat: -34.9214, lon: -57.9544 } },
  { id: '10', name: 'Catamarca', centroide: { lat: -28.4696, lon: -65.7795 } },
  { id: '22', name: 'Chaco', centroide: { lat: -27.4514, lon: -58.9867 } },
  { id: '26', name: 'Chubut', centroide: { lat: -43.3002, lon: -65.1023 } },
  {
    id: '02',
    name: 'Ciudad Autónoma de Buenos Aires',
    centroide: { lat: -34.6037, lon: -58.3816 },
  },
  { id: '14', name: 'Córdoba', centroide: { lat: -31.4201, lon: -64.1888 } },
  { id: '18', name: 'Corrientes', centroide: { lat: -27.4692, lon: -58.8306 } },
  { id: '30', name: 'Entre Ríos', centroide: { lat: -31.7333, lon: -60.5297 } },
  { id: '34', name: 'Formosa', centroide: { lat: -26.1849, lon: -58.1731 } },
  { id: '38', name: 'Jujuy', centroide: { lat: -24.1858, lon: -65.2995 } },
  { id: '42', name: 'La Pampa', centroide: { lat: -36.6167, lon: -64.2833 } },
  { id: '46', name: 'La Rioja', centroide: { lat: -29.4131, lon: -66.8558 } },
  { id: '50', name: 'Mendoza', centroide: { lat: -32.8895, lon: -68.8458 } },
  { id: '54', name: 'Misiones', centroide: { lat: -27.3671, lon: -55.8961 } },
  { id: '58', name: 'Neuquén', centroide: { lat: -38.9516, lon: -68.0591 } },
  { id: '62', name: 'Río Negro', centroide: { lat: -40.8135, lon: -62.9967 } },
  { id: '66', name: 'Salta', centroide: { lat: -24.7859, lon: -65.4117 } },
  { id: '70', name: 'San Juan', centroide: { lat: -31.5375, lon: -68.5364 } },
  { id: '74', name: 'San Luis', centroide: { lat: -33.3017, lon: -66.3378 } },
  { id: '78', name: 'Santa Cruz', centroide: { lat: -51.6226, lon: -69.2181 } },
  { id: '82', name: 'Santa Fe', centroide: { lat: -31.6333, lon: -60.7 } },
  { id: '86', name: 'Santiago del Estero', centroide: { lat: -27.7824, lon: -64.2642 } },
  {
    id: '94',
    name: 'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
    centroide: { lat: -54.8019, lon: -68.303 },
  },
  { id: '90', name: 'Tucumán', centroide: { lat: -26.8083, lon: -65.2176 } },
].sort((a, b) => a.name.localeCompare(b.name, 'es'));

let provincesCache: ArgentinaProvince[] | null = null;
const localitiesCache = new Map<string, ArgentinaLocality[]>();

function normalizeCentroide(
  raw: { lat?: number; lon?: number } | null | undefined,
  fallback?: ArgentinaCentroide,
): ArgentinaCentroide {
  if (raw && Number.isFinite(raw.lat) && Number.isFinite(raw.lon)) {
    // Georef a veces devuelve el centroide antártico para Tierra del Fuego.
    if (raw.lat! < -60) {
      return fallback ?? { lat: -54.8019, lon: -68.303 };
    }
    return { lat: raw.lat!, lon: raw.lon! };
  }
  return fallback ?? { lat: -34.6037, lon: -58.3816 };
}

export async function fetchArgentinaProvinces(): Promise<ArgentinaProvince[]> {
  if (provincesCache) return provincesCache;

  try {
    const res = await fetch(
      `${GEOREF_BASE}/provincias?campos=id,nombre,centroide&max=30&orden=nombre`,
    );
    if (!res.ok) throw new Error(`Georef provincias HTTP ${res.status}`);
    const json = (await res.json()) as {
      provincias?: Array<{
        id: string;
        nombre: string;
        centroide?: { lat: number; lon: number };
      }>;
    };

    const fallbackById = new Map(ARGENTINA_PROVINCES_FALLBACK.map((p) => [p.id, p]));
    const list = (json.provincias ?? []).map((p) => {
      const fallback = fallbackById.get(p.id);
      return {
        id: p.id,
        name: p.nombre,
        centroide: normalizeCentroide(p.centroide, fallback?.centroide),
      };
    });

    provincesCache =
      list.length > 0
        ? list.sort((a, b) => a.name.localeCompare(b.name, 'es'))
        : ARGENTINA_PROVINCES_FALLBACK;
  } catch {
    provincesCache = ARGENTINA_PROVINCES_FALLBACK;
  }

  return provincesCache;
}

export async function fetchArgentinaLocalities(
  provinceId: string,
): Promise<ArgentinaLocality[]> {
  if (!provinceId) return [];
  const cached = localitiesCache.get(provinceId);
  if (cached) return cached;

  // CABA: una sola "ciudad".
  if (provinceId === '02') {
    const caba: ArgentinaLocality[] = [
      {
        id: '02',
        name: 'Ciudad Autónoma de Buenos Aires',
        centroide: { lat: -34.6037, lon: -58.3816 },
      },
    ];
    localitiesCache.set(provinceId, caba);
    return caba;
  }

  try {
    const res = await fetch(
      `${GEOREF_BASE}/municipios?provincia=${encodeURIComponent(provinceId)}&campos=id,nombre,centroide&max=1000&orden=nombre`,
    );
    if (!res.ok) throw new Error(`Georef municipios HTTP ${res.status}`);
    const json = (await res.json()) as {
      municipios?: Array<{
        id: string;
        nombre: string;
        centroide?: { lat: number; lon: number };
      }>;
    };

    let list = (json.municipios ?? []).map((m) => ({
      id: m.id,
      name: m.nombre,
      centroide: m.centroide
        ? normalizeCentroide(m.centroide)
        : null,
    }));

    // Algunas provincias tienen pocos municipios; completar con localidades.
    if (list.length < 5) {
      const locRes = await fetch(
        `${GEOREF_BASE}/localidades?provincia=${encodeURIComponent(provinceId)}&campos=id,nombre,centroide&max=500&orden=nombre`,
      );
      if (locRes.ok) {
        const locJson = (await locRes.json()) as {
          localidades?: Array<{
            id: string;
            nombre: string;
            centroide?: { lat: number; lon: number };
          }>;
        };
        const byName = new Map(list.map((item) => [item.name.toLowerCase(), item]));
        for (const loc of locJson.localidades ?? []) {
          const key = loc.nombre.toLowerCase();
          if (byName.has(key)) continue;
          byName.set(key, {
            id: loc.id,
            name: loc.nombre,
            centroide: loc.centroide ? normalizeCentroide(loc.centroide) : null,
          });
        }
        list = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      }
    }

    localitiesCache.set(provinceId, list);
    return list;
  } catch {
    localitiesCache.set(provinceId, []);
    return [];
  }
}

export type ArgentinaAddressSuggestion = {
  id: string;
  label: string;
  streetLine: string;
  provinceId: string;
  provinceName: string;
  cityName: string;
  lat: number;
  lon: number;
};

type GeorefDireccion = {
  nomenclatura?: string;
  calle?: { nombre?: string | null };
  altura?: { valor?: number | string | null };
  provincia?: { id?: string; nombre?: string };
  localidad_censal?: { nombre?: string | null };
  departamento?: { nombre?: string | null };
  ubicacion?: { lat?: number | null; lon?: number | null };
};

/** Busca direcciones en Argentina (Georef). Mínimo ~3 caracteres recomendado. */
export async function searchArgentinaAddresses(
  query: string,
  options?: { provinceId?: string; max?: number },
): Promise<ArgentinaAddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    direccion: trimmed,
    max: String(options?.max ?? 8),
    campos: 'completo',
  });
  if (options?.provinceId) {
    params.set('provincia', options.provinceId);
  }

  try {
    const res = await fetch(`${GEOREF_BASE}/direcciones?${params.toString()}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { direcciones?: GeorefDireccion[] };

    return (json.direcciones ?? [])
      .map((d, index) => {
        const lat = d.ubicacion?.lat;
        const lon = d.ubicacion?.lon;
        if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }
        const provinceId = d.provincia?.id ?? '';
        const provinceName = d.provincia?.nombre ?? '';
        const cityName =
          d.localidad_censal?.nombre ||
          d.departamento?.nombre ||
          '';
        const streetName = d.calle?.nombre?.trim() || '';
        const height =
          d.altura?.valor != null && String(d.altura.valor).trim() !== ''
            ? String(d.altura.valor)
            : '';
        const streetLine = [streetName, height].filter(Boolean).join(' ').trim();
        const label = d.nomenclatura?.trim() || streetLine || trimmed;

        return {
          id: `${provinceId}-${streetName}-${height}-${index}`,
          label,
          streetLine: streetLine || label,
          provinceId,
          provinceName,
          cityName,
          lat,
          lon,
        } satisfies ArgentinaAddressSuggestion;
      })
      .filter((item): item is ArgentinaAddressSuggestion => item != null);
  } catch {
    return [];
  }
}

const PROVINCE_ALIASES: Record<string, string> = {
  caba: 'Ciudad Autónoma de Buenos Aires',
  'capital federal': 'Ciudad Autónoma de Buenos Aires',
  'ciudad de buenos aires': 'Ciudad Autónoma de Buenos Aires',
  'tierra del fuego': 'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
};

export function findProvinceByName(
  provinces: ArgentinaProvince[],
  name: string | null | undefined,
): ArgentinaProvince | undefined {
  if (!name?.trim()) return undefined;
  const normalized = name.trim().toLowerCase();
  const aliased = PROVINCE_ALIASES[normalized] ?? name.trim();
  const aliasedLower = aliased.toLowerCase();
  return provinces.find((p) => p.name.toLowerCase() === aliasedLower);
}
