'use client';

import { FormEvent, useMemo, useState } from 'react';
import { api } from '../lib/api-client';
import type { BuildingDetail, Floor, Subzone, Zone } from '../lib/types';

type ZoneWithSub = Zone & { subzones: Subzone[] };
type FloorWithZones = Floor & { zones: ZoneWithSub[] };

interface BuildingHierarchyManagerProps {
  building: BuildingDetail;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

function countStructure(floors: FloorWithZones[]) {
  const zones = floors.reduce((acc, f) => acc + f.zones.length, 0);
  const subzones = floors.reduce(
    (acc, f) => acc + f.zones.reduce((zAcc, z) => zAcc + z.subzones.length, 0),
    0,
  );
  return { floors: floors.length, zones, subzones };
}

function matchesSearch(text: string, query: string) {
  return text.toLowerCase().includes(query.toLowerCase());
}

export function BuildingHierarchyManager({
  building,
  onRefresh,
  onError,
  onSuccess,
}: BuildingHierarchyManagerProps) {
  const floors = building.floors;

  const stats = useMemo(() => countStructure(floors), [floors]);

  const [search, setSearch] = useState('');
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(() => {
    if (floors.length <= 4) return new Set(floors.map((f) => f.id));
    return floors[0] ? new Set([floors[0].id]) : new Set();
  });

  const [floorName, setFloorName] = useState('');
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({});
  const [subzoneNames, setSubzoneNames] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const filteredFloors = useMemo(() => {
    const q = search.trim();
    if (!q) return floors;

    return floors
      .map((floor) => {
        const floorMatch = matchesSearch(floor.name, q);
        const zones = floor.zones
          .map((zone) => {
            const zoneMatch = floorMatch || matchesSearch(zone.name, q);
            const subzones = zone.subzones.filter(
              (sub) => zoneMatch || matchesSearch(sub.name, q),
            );
            if (zoneMatch || subzones.length > 0) {
              return { ...zone, subzones: zoneMatch ? zone.subzones : subzones };
            }
            return null;
          })
          .filter((z): z is ZoneWithSub => z !== null);

        if (floorMatch || zones.length > 0) {
          return { ...floor, zones: floorMatch ? floor.zones : zones };
        }
        return null;
      })
      .filter((f): f is FloorWithZones => f !== null);
  }, [floors, search]);

  async function runAction(key: string, action: () => Promise<unknown>, okMessage: string) {
    setBusyKey(key);
    onError('');
    try {
      await action();
      onSuccess(okMessage);
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Operación fallida');
    } finally {
      setBusyKey(null);
    }
  }

  function toggleFloor(floorId: string) {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
  }

  function expandAll() {
    setExpandedFloors(new Set(floors.map((f) => f.id)));
  }

  function collapseAll() {
    setExpandedFloors(new Set());
  }

  async function createFloor(e: FormEvent) {
    e.preventDefault();
    const name = floorName.trim();
    if (!name) return;
    await runAction(
      'floor-new',
      () => api.post(`/buildings/${building.id}/floors`, { name }),
      `Planta "${name}" creada.`,
    );
    setFloorName('');
  }

  async function createZone(floorId: string) {
    const name = zoneNames[floorId]?.trim();
    if (!name) return;
    await runAction(
      `zone-${floorId}`,
      () => api.post(`/floors/${floorId}/zones`, { name }),
      `Zona "${name}" creada.`,
    );
    setZoneNames((prev) => ({ ...prev, [floorId]: '' }));
    setExpandedFloors((prev) => new Set(prev).add(floorId));
  }

  async function createSubzone(zoneId: string, floorId: string) {
    const name = subzoneNames[zoneId]?.trim();
    if (!name) return;
    await runAction(
      `subzone-${zoneId}`,
      () => api.post(`/zones/${zoneId}/subzones`, { name }),
      `Subzona "${name}" creada.`,
    );
    setSubzoneNames((prev) => ({ ...prev, [zoneId]: '' }));
    setExpandedFloors((prev) => new Set(prev).add(floorId));
  }

  async function deleteFloor(floor: FloorWithZones) {
    if (
      !window.confirm(
        `¿Eliminar la planta "${floor.name}" y todo su contenido (${floor.zones.length} zonas)?`,
      )
    ) {
      return;
    }
    await runAction(
      `del-floor-${floor.id}`,
      () => api.delete(`/floors/${floor.id}`),
      `Planta "${floor.name}" eliminada.`,
    );
  }

  async function deleteZone(zone: ZoneWithSub, floorName: string) {
    if (
      !window.confirm(
        `¿Eliminar la zona "${zone.name}" de ${floorName} (${zone.subzones.length} subzonas)?`,
      )
    ) {
      return;
    }
    await runAction(
      `del-zone-${zone.id}`,
      () => api.delete(`/zones/${zone.id}`),
      `Zona "${zone.name}" eliminada.`,
    );
  }

  async function deleteSubzone(sub: Subzone, zoneName: string) {
    if (!window.confirm(`¿Eliminar la subzona "${sub.name}" de ${zoneName}?`)) return;
    await runAction(
      `del-sub-${sub.id}`,
      () => api.delete(`/subzones/${sub.id}`),
      `Subzona "${sub.name}" eliminada.`,
    );
  }

  return (
    <div className="hierarchy-shell">
      <div className="hierarchy-stats">
        <div className="hierarchy-stat-chip">
          <span className="hierarchy-stat-value">{stats.floors}</span>
          <span className="hierarchy-stat-label">Plantas</span>
        </div>
        <div className="hierarchy-stat-chip">
          <span className="hierarchy-stat-value">{stats.zones}</span>
          <span className="hierarchy-stat-label">Zonas</span>
        </div>
        <div className="hierarchy-stat-chip">
          <span className="hierarchy-stat-value">{stats.subzones}</span>
          <span className="hierarchy-stat-label">Subzonas</span>
        </div>
      </div>

      <div className="card hierarchy-toolbar-card">
        <div className="hierarchy-toolbar">
          <form className="hierarchy-add-floor" onSubmit={createFloor}>
            <div className="form-field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
              <label>Nueva planta</label>
              <input
                value={floorName}
                onChange={(e) => setFloorName(e.target.value)}
                placeholder="Ej: Planta PB"
                disabled={busyKey === 'floor-new'}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!floorName.trim() || busyKey === 'floor-new'}
            >
              {busyKey === 'floor-new' ? 'Agregando…' : '+ Planta'}
            </button>
          </form>

          <div className="form-field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
            <label>Buscar en la estructura</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Planta, zona o subzona…"
            />
          </div>

          <div className="hierarchy-toolbar-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={expandAll}>
              Expandir todo
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={collapseAll}>
              Colapsar todo
            </button>
          </div>
        </div>
      </div>

      {floors.length === 0 ? (
        <div className="card hierarchy-empty">
          <div className="hierarchy-empty-icon" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
            </svg>
          </div>
          <h3>Sin plantas todavía</h3>
          <p className="muted">Creá la primera planta arriba. Luego podés agregar zonas y subzonas dentro de cada una.</p>
        </div>
      ) : filteredFloors.length === 0 ? (
        <div className="card">
          <p className="muted">Ningún resultado para &quot;{search}&quot;.</p>
        </div>
      ) : (
        filteredFloors.map((floor) => {
          const isExpanded = expandedFloors.has(floor.id) || Boolean(search.trim());
          const zoneBusy = busyKey === `zone-${floor.id}`;

          return (
            <div key={floor.id} className="hierarchy-floor">
              <div className="hierarchy-floor-header">
                <button
                  type="button"
                  className="hierarchy-floor-toggle"
                  onClick={() => toggleFloor(floor.id)}
                  aria-expanded={isExpanded}
                >
                  <span className={`hierarchy-chevron ${isExpanded ? 'expanded' : ''}`} aria-hidden>
                    ▶
                  </span>
                  <span className="hierarchy-floor-title">{floor.name}</span>
                  <span className="hierarchy-floor-meta">
                    {floor.zones.length} zona{floor.zones.length === 1 ? '' : 's'}
                    {' · '}
                    {floor.zones.reduce((n, z) => n + z.subzones.length, 0)} subzona
                    {floor.zones.reduce((n, z) => n + z.subzones.length, 0) === 1 ? '' : 's'}
                  </span>
                </button>
                <button
                  type="button"
                  className="hierarchy-delete-btn"
                  title="Eliminar planta"
                  disabled={busyKey === `del-floor-${floor.id}`}
                  onClick={() => void deleteFloor(floor)}
                >
                  {busyKey === `del-floor-${floor.id}` ? '…' : 'Eliminar'}
                </button>
              </div>

              {isExpanded ? (
                <div className="hierarchy-floor-body">
                  <div className="hierarchy-quick-add">
                    <input
                      value={zoneNames[floor.id] ?? ''}
                      onChange={(e) =>
                        setZoneNames((prev) => ({ ...prev, [floor.id]: e.target.value }))
                      }
                      placeholder="Nueva zona (Ej: Cocina, Habitación 101…)"
                      disabled={zoneBusy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void createZone(floor.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!zoneNames[floor.id]?.trim() || zoneBusy}
                      onClick={() => void createZone(floor.id)}
                    >
                      {zoneBusy ? '…' : '+ Zona'}
                    </button>
                  </div>

                  {floor.zones.length === 0 ? (
                    <p className="muted hierarchy-empty-inline">Sin zonas. Agregá una arriba.</p>
                  ) : (
                    <div className="hierarchy-zones">
                      {floor.zones.map((zone) => {
                        const subBusy = busyKey === `subzone-${zone.id}`;
                        const delZoneBusy = busyKey === `del-zone-${zone.id}`;

                        return (
                          <div key={zone.id} className="hierarchy-zone">
                            <div className="hierarchy-zone-header">
                              <span className="hierarchy-zone-icon" aria-hidden>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="3" width="18" height="18" rx="2" />
                                </svg>
                              </span>
                              <span className="hierarchy-zone-name">{zone.name}</span>
                              <span className="hierarchy-zone-meta">
                                {zone.subzones.length} subzona{zone.subzones.length === 1 ? '' : 's'}
                              </span>
                              <button
                                type="button"
                                className="hierarchy-delete-btn hierarchy-delete-btn--inline"
                                disabled={delZoneBusy}
                                onClick={() => void deleteZone(zone, floor.name)}
                              >
                                {delZoneBusy ? '…' : 'Eliminar'}
                              </button>
                            </div>

                            {zone.subzones.length > 0 ? (
                              <div className="hierarchy-subzone-list">
                                {zone.subzones.map((sub) => (
                                  <span key={sub.id} className="hierarchy-pill">
                                    {sub.name}
                                    <button
                                      type="button"
                                      className="hierarchy-pill-remove"
                                      aria-label={`Eliminar subzona ${sub.name}`}
                                      disabled={busyKey === `del-sub-${sub.id}`}
                                      onClick={() => void deleteSubzone(sub, zone.name)}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="muted hierarchy-empty-inline">
                                Sin subzonas — las tareas pueden ir directo en la zona.
                              </p>
                            )}

                            <div className="hierarchy-quick-add hierarchy-quick-add--sub">
                              <input
                                value={subzoneNames[zone.id] ?? ''}
                                onChange={(e) =>
                                  setSubzoneNames((prev) => ({ ...prev, [zone.id]: e.target.value }))
                                }
                                placeholder="Nueva subzona (opcional)"
                                disabled={subBusy}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void createSubzone(zone.id, floor.id);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={!subzoneNames[zone.id]?.trim() || subBusy}
                                onClick={() => void createSubzone(zone.id, floor.id)}
                              >
                                {subBusy ? '…' : '+ Subzona'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })
      )}

      <p className="muted hierarchy-hint">
        Tip: si una zona tiene subzonas, las tareas deben asignarse a la subzona, no a la zona directamente.
      </p>
    </div>
  );
}
