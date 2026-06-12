export interface LocatedItem {
  zoneId: string | null;
  subzoneId: string | null;
}

export interface LocationSubzoneGroup<T> {
  subId: string;
  subName: string;
  items: T[];
}

export interface LocationZoneGroup<T> {
  zoneId: string;
  zoneName: string;
  zoneIndex: number;
  subzones: LocationSubzoneGroup<T>[];
  items: T[];
}

export interface LocationFloorGroup<T> {
  floorId: string;
  floorName: string;
  floorShort: string;
  zones: LocationZoneGroup<T>[];
  items: T[];
}

function getFloorShortName(name: string, sortOrder: number): string {
  const match = name.match(/\b(PB|SS|S\d+|\d+)\b/i);
  if (match) return match[1].toUpperCase();
  return String(sortOrder);
}

/** Agrupa ítems por planta → zona → subzona (misma lógica que tareas periódicas). */
export function buildLocationHierarchy<T extends LocatedItem>(
  items: T[],
  floors: { id: string; name: string; sortOrder: number }[],
  zones: { id: string; name: string; floorId: string }[],
  subzones: { id: string; name: string; zoneId: string }[],
): { hierarchy: LocationFloorGroup<T>[]; unlocated: T[] } {
  const floorMap = new Map<string, LocationFloorGroup<T>>();
  const unlocated: T[] = [];

  for (const floor of [...floors].sort((a, b) => a.sortOrder - b.sortOrder)) {
    floorMap.set(floor.id, {
      floorId: floor.id,
      floorName: floor.name,
      floorShort: getFloorShortName(floor.name, floor.sortOrder),
      zones: [],
      items: [],
    });
  }

  for (const item of items) {
    if (!item.zoneId) {
      unlocated.push(item);
      continue;
    }

    const zone = zones.find((z) => z.id === item.zoneId);
    if (!zone) {
      unlocated.push(item);
      continue;
    }

    let floorGroup = floorMap.get(zone.floorId);
    if (!floorGroup) {
      floorGroup = {
        floorId: zone.floorId,
        floorName: 'Planta',
        floorShort: '?',
        zones: [],
        items: [],
      };
      floorMap.set(zone.floorId, floorGroup);
    }

    floorGroup.items.push(item);

    let zoneGroup = floorGroup.zones.find((z) => z.zoneId === zone.id);
    if (!zoneGroup) {
      zoneGroup = {
        zoneId: zone.id,
        zoneName: zone.name,
        zoneIndex: floorGroup.zones.length + 1,
        subzones: [],
        items: [],
      };
      floorGroup.zones.push(zoneGroup);
    }

    zoneGroup.items.push(item);

    const subId = item.subzoneId ?? `zone-${zone.id}`;
    const sub = subzones.find((s) => s.id === item.subzoneId);
    const subName = sub?.name ?? 'General';

    let subGroup = zoneGroup.subzones.find((s) => s.subId === subId);
    if (!subGroup) {
      subGroup = { subId, subName, items: [] };
      zoneGroup.subzones.push(subGroup);
    }
    subGroup.items.push(item);
  }

  const hierarchy = Array.from(floorMap.values()).filter((f) => f.items.length > 0);
  return { hierarchy, unlocated };
}
