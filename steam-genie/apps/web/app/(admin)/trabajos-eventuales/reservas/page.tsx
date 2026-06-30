'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  defaultDatetimeLocal,
  LocationPicker,
  toIsoFromDatetimeLocal,
} from '../../../../components/LocationPicker';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import { RESERVATION_STATUS_LABELS } from '../../../../lib/labels';
import type { CreateReservationResponse, Paginated, ReservationItem } from '../../../../lib/types';

const PAGE_SIZE = 20;

export default function EventualReservationsPage() {
  const [items, setItems] = useState<ReservationItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [location, setLocation] = useState({
    buildingId: '',
    floorId: '',
    zoneId: '',
    subzoneId: '',
  });
  const [guestName, setGuestName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [checkinAt, setCheckinAt] = useState(defaultDatetimeLocal(-2, 15));
  const [checkoutAt, setCheckoutAt] = useState(defaultDatetimeLocal(0, 11));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(page),
      });
      const res = await api.get<Paginated<ReservationItem>>(`/reservations?${params}`);
      setItems(res.data);
      setTotal(res.total);
      setPages(Math.max(1, res.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar reservas');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchBuildingsList()
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!location.buildingId || !location.floorId || !location.zoneId) {
      setError('Seleccioná edificio, planta y zona.');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);
    setInfo(null);
    try {
      const res = await api.post<CreateReservationResponse>('/reservations', {
        buildingId: location.buildingId,
        floorId: location.floorId,
        zoneId: location.zoneId,
        guestName: guestName || undefined,
        externalId: externalId || undefined,
        checkinAt: toIsoFromDatetimeLocal(checkinAt),
        checkoutAt: toIsoFromDatetimeLocal(checkoutAt),
        source: 'MANUAL',
      });

      setSuccess(
        `Reserva creada. Se generó el servicio "${res.workOrder.title}" (${res.taskCount} tareas).`,
      );
      if (res.warning) setInfo(res.warning);
      setGuestName('');
      setExternalId('');
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/trabajos-eventuales" className="back-link">
            ← Trabajos eventuales
          </Link>
          <h1 className="page-title">Reservas</h1>
          <p className="page-subtitle">
            Creá reservas que generan automáticamente un servicio de limpieza checkout.
          </p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}
      {info ? <div className="alert alert-info">{info}</div> : null}

      <div className="card">
        <h2 className="card-title">Nueva reserva</h2>
        <p className="muted">
          Al crear una reserva se genera automáticamente un servicio{' '}
          <strong>CHECKOUT_CLEANING</strong> con las tareas eventuales de la zona y sus subzonas.
        </p>
        <form onSubmit={handleCreate} className="stack">
          <LocationPicker value={location} onChange={setLocation} hideSubzone buildings={buildings} />

          <div className="grid-2">
            <div className="form-field">
              <label>Huésped</label>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Referencia externa</label>
              <input value={externalId} onChange={(e) => setExternalId(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Check-in *</label>
              <input
                type="datetime-local"
                value={checkinAt}
                onChange={(e) => setCheckinAt(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>Check-out *</label>
              <input
                type="datetime-local"
                value={checkoutAt}
                onChange={(e) => setCheckoutAt(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear reserva'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Listado</h2>
        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
            <p className="muted">Cargando reservas…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">No hay reservas cargadas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Huésped</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Estado</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.guestName ?? '—'}</td>
                    <td>{new Date(item.checkinAt).toLocaleString('es-AR')}</td>
                    <td>{new Date(item.checkoutAt).toLocaleString('es-AR')}</td>
                    <td>{RESERVATION_STATUS_LABELS[item.status] ?? item.status}</td>
                    <td>{item.externalId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length > 0 ? (
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
              Página {page} de {pages} · {total} reserva{total === 1 ? '' : 's'}
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
        ) : null}
      </div>
    </>
  );
}
