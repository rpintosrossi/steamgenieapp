'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api-client';
import type { BuildingDetail } from '../../../../lib/types';

export default function BuildingDetailPage() {
  const params = useParams<{ id: string }>();
  const buildingId = params.id;

  const [building, setBuilding] = useState<BuildingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [floorName, setFloorName] = useState('');
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({});
  const [subzoneNames, setSubzoneNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<BuildingDetail>(`/buildings/${buildingId}`);
      setBuilding(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el edificio');
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: () => Promise<unknown>, okMessage: string) {
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(okMessage);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operación fallida');
    }
  }

  async function createFloor(e: FormEvent) {
    e.preventDefault();
    await runAction(
      () => api.post(`/buildings/${buildingId}/floors`, { name: floorName }),
      'Planta creada.',
    );
    setFloorName('');
  }

  async function createZone(floorId: string) {
    const name = zoneNames[floorId]?.trim();
    if (!name) return;
    await runAction(
      () => api.post(`/floors/${floorId}/zones`, { name }),
      'Zona creada.',
    );
    setZoneNames((prev) => ({ ...prev, [floorId]: '' }));
  }

  async function createSubzone(zoneId: string) {
    const name = subzoneNames[zoneId]?.trim();
    if (!name) return;
    await runAction(
      () => api.post(`/zones/${zoneId}/subzones`, { name }),
      'Subzona creada.',
    );
    setSubzoneNames((prev) => ({ ...prev, [zoneId]: '' }));
  }

  if (loading) return <p className="muted">Cargando edificio…</p>;
  if (!building) return <div className="alert alert-error">{error ?? 'Edificio no encontrado'}</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/buildings" className="muted">← Volver a edificios</Link>
          <h1 className="page-title">{building.name}</h1>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <h2 className="card-title">Nueva planta</h2>
        <form className="inline-form" onSubmit={createFloor}>
          <div className="form-field">
            <label>Nombre</label>
            <input value={floorName} onChange={(e) => setFloorName(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Agregar planta</button>
        </form>
      </div>

      {building.floors.length === 0 ? (
        <div className="card">
          <p className="muted">Todavía no hay plantas. Creá la primera para agregar zonas.</p>
        </div>
      ) : (
        building.floors.map((floor) => (
          <div key={floor.id} className="card hierarchy-block">
            <h3 style={{ marginTop: 0 }}>Planta: {floor.name}</h3>

            <div className="inline-form" style={{ marginBottom: 16 }}>
              <div className="form-field">
                <label>Nueva zona</label>
                <input
                  value={zoneNames[floor.id] ?? ''}
                  onChange={(e) => setZoneNames((prev) => ({ ...prev, [floor.id]: e.target.value }))}
                  placeholder="Ej: Habitación 1"
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void createZone(floor.id)}
              >
                Agregar zona
              </button>
            </div>

            {floor.zones.length === 0 ? (
              <p className="muted">Sin zonas en esta planta.</p>
            ) : (
              floor.zones.map((zone) => (
                <div key={zone.id} className="hierarchy-block" style={{ marginBottom: 10 }}>
                  <h4>Zona: {zone.name}</h4>

                  <div className="inline-form">
                    <div className="form-field">
                      <label>Nueva subzona</label>
                      <input
                        value={subzoneNames[zone.id] ?? ''}
                        onChange={(e) =>
                          setSubzoneNames((prev) => ({ ...prev, [zone.id]: e.target.value }))
                        }
                        placeholder="Opcional"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void createSubzone(zone.id)}
                    >
                      Agregar subzona
                    </button>
                  </div>

                  {zone.subzones.length > 0 ? (
                    <ul>
                      {zone.subzones.map((sub) => (
                        <li key={sub.id}>{sub.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Sin subzonas.</p>
                  )}
                </div>
              ))
            )}
          </div>
        ))
      )}
    </>
  );
}
