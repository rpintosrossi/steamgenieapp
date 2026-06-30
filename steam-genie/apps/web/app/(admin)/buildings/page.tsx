'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CreateBuildingModal } from '../../../components/CreateBuildingModal';
import { api } from '../../../lib/api-client';
import type { Building, Paginated } from '../../../lib/types';

const PAGE_SIZE = 15;

function formatLocation(building: Building): string {
  const parts = [building.address, building.city, building.province].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function hasGps(building: Building): boolean {
  return building.latitude != null && building.longitude != null;
}

function formatCreatedAt(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function BuildingsPage() {
  const [items, setItems] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (search.trim()) params.set('search', search.trim());

    try {
      const res = await api.get<Paginated<Building>>(`/buildings?${params.toString()}`);
      setItems(res.data);
      setTotal(res.total);
      setPages(Math.max(1, res.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar edificios');
    } finally {
      setLoading(false);
    }
  }, [page, search, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput('');
    setSearch('');
    setPage(1);
  }

  function handleCreated(building: Building) {
    setCreateOpen(false);
    setSuccess(`Edificio "${building.name}" creado correctamente.`);
    setError(null);
    setPage(1);
    setSearch('');
    setSearchInput('');
    setRefreshKey((k) => k + 1);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/configuracion" className="back-link">
            ← Configuración
          </Link>
          <h1 className="page-title">Edificios</h1>
          <p className="page-subtitle">
            Listado de edificios. Gestioná la estructura y tareas desde cada uno.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setCreateOpen(true)}
          >
            Crear edificio
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <form className="inline-form" style={{ marginBottom: 16 }} onSubmit={applySearch}>
          <div className="form-field" style={{ flex: 1 }}>
            <label>Buscar</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre, ciudad o dirección"
            />
          </div>
          <div className="form-actions" style={{ alignSelf: 'flex-end' }}>
            <button type="submit" className="btn btn-secondary btn-sm">
              Buscar
            </button>
            {search ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearSearch}>
                Limpiar
              </button>
            ) : null}
          </div>
        </form>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando edificios…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="stack" style={{ alignItems: 'flex-start', gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>
              {search
                ? 'No se encontraron edificios con ese criterio.'
                : 'Todavía no hay edificios cargados.'}
            </p>
            {!search ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setCreateOpen(true)}
              >
                Crear el primero
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Edificio</th>
                    <th>Ubicación</th>
                    <th>GPS</th>
                    <th>Alta</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={item.isActive === false ? 'row-muted' : undefined}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>{formatLocation(item)}</td>
                      <td>
                        <span className={`badge ${hasGps(item) ? 'badge-success' : ''}`}>
                          {hasGps(item) ? 'Configurado' : 'Sin GPS'}
                        </span>
                      </td>
                      <td>{formatCreatedAt(item.createdAt)}</td>
                      <td>
                        <span
                          className={`badge ${item.isActive === false ? '' : 'badge-success'}`}
                        >
                          {item.isActive === false ? 'Inactivo' : 'Activo'}
                        </span>
                      </td>
                      <td>
                        <Link href={`/buildings/${item.id}`} className="btn btn-secondary btn-sm">
                          Gestionar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="pagination-info">
                Página {page} de {pages} · {total} edificio{total === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>

      {createOpen ? (
        <CreateBuildingModal
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </>
  );
}
