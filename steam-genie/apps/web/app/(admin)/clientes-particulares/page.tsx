'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  BuildingLocationFields,
  type BuildingLocationFieldsValue,
} from '../../../components/BuildingLocationFields';
import { api } from '../../../lib/api-client';
import { invalidateBuildingsListCache } from '../../../lib/buildings-cache';
import type { ParticularClientItem } from '../../../lib/types';

type ContactForm = {
  name: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
};

const EMPTY_CONTACT: ContactForm = {
  name: '',
  taxId: '',
  contactName: '',
  email: '',
  phone: '',
  notes: '',
};

const EMPTY_LOCATION: BuildingLocationFieldsValue = {
  address: '',
  province: '',
  city: '',
  latitude: '',
  longitude: '',
  gpsRadiusM: '200',
  requireGpsValidation: true,
};

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function formatLocation(item: ParticularClientItem): string {
  const parts = [
    item.building?.address ?? item.address,
    item.building?.city,
    item.building?.province,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export default function ParticularClientsPage() {
  const [items, setItems] = useState<ParticularClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);
  const [location, setLocation] = useState<BuildingLocationFieldsValue>(EMPTY_LOCATION);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        includeInactive: showInactive ? 'true' : 'false',
      });
      if (search.trim()) params.set('search', search.trim());
      const data = await api.get<ParticularClientItem[]>(`/particular-clients?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, [search, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setContact(EMPTY_CONTACT);
    setLocation(EMPTY_LOCATION);
    setCreateError(null);
    setShowCreate(true);
  }

  function closeCreate() {
    if (creating) return;
    setShowCreate(false);
    setContact(EMPTY_CONTACT);
    setLocation(EMPTY_LOCATION);
    setCreateError(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!contact.name.trim()) return;

    setCreating(true);
    setCreateError(null);
    setError(null);
    setSuccess(null);

    try {
      const lat = parseOptionalNumber(location.latitude);
      const lng = parseOptionalNumber(location.longitude);
      const radius = parseOptionalNumber(location.gpsRadiusM);

      if (location.requireGpsValidation && (lat == null || lng == null)) {
        setCreateError('Seleccioná la ubicación del cliente en el mapa.');
        setCreating(false);
        return;
      }

      await api.post('/particular-clients', {
        name: contact.name.trim(),
        ...(contact.taxId.trim() ? { taxId: contact.taxId.trim() } : {}),
        ...(contact.contactName.trim() ? { contactName: contact.contactName.trim() } : {}),
        ...(contact.email.trim() ? { email: contact.email.trim() } : {}),
        ...(contact.phone.trim() ? { phone: contact.phone.trim() } : {}),
        ...(contact.notes.trim() ? { notes: contact.notes.trim() } : {}),
        address: location.address.trim() || undefined,
        city: location.city.trim() || undefined,
        province: location.province.trim() || undefined,
        requireGpsValidation: location.requireGpsValidation,
        latitude: lat,
        longitude: lng,
        gpsRadiusM: radius,
      });

      invalidateBuildingsListCache();
      setShowCreate(false);
      setContact(EMPTY_CONTACT);
      setLocation(EMPTY_LOCATION);
      setSuccess('Cliente creado. Ya podés configurar zonas desde su ficha.');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No se pudo crear el cliente');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(item: ParticularClientItem) {
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/particular-clients/${item.id}`, { isActive: !item.isActive });
      invalidateBuildingsListCache();
      setSuccess(item.isActive ? 'Cliente desactivado.' : 'Cliente activado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el cliente');
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(item: ParticularClientItem) {
    if (!window.confirm(`¿Eliminar el cliente "${item.name}"?`)) return;

    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/particular-clients/${item.id}`);
      invalidateBuildingsListCache();
      setSuccess('Cliente eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el cliente');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes particulares</h1>
          <p className="page-subtitle">
            Personas o empresas sueltas con ubicación, zonas y subzonas para presupuestos y
            servicios eventuales.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Nuevo cliente
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 12,
        }}
      >
        <div className="form-field" style={{ margin: 0, flex: '1 1 220px' }}>
          <label htmlFor="pc-search">Buscar</label>
          <input
            id="pc-search"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, CUIT, contacto, email o teléfono"
          />
        </div>
        <label className="checkbox-label" style={{ marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inactivos
        </label>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
          </div>
        ) : items.length === 0 ? (
          <p className="empty-state">No hay clientes particulares.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>CUIT</th>
                  <th>Contacto</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const busy = savingId === item.id;
                  return (
                    <tr key={item.id} className={!item.isActive ? 'row-muted' : undefined}>
                      <td>
                        <Link href={`/clientes-particulares/${item.id}/datos`}>
                          {item.name}
                        </Link>
                      </td>
                      <td>{item.taxId ?? '—'}</td>
                      <td>
                        <div>{item.contactName ?? '—'}</div>
                        {item.phone ? (
                          <div style={{ fontSize: 12, opacity: 0.75 }}>{item.phone}</div>
                        ) : null}
                      </td>
                      <td>{formatLocation(item)}</td>
                      <td>
                        <span className={item.isActive ? 'badge badge-success' : 'badge badge-warning'}>
                          {item.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link
                            href={`/clientes-particulares/${item.id}/datos`}
                            className="btn btn-ghost btn-sm"
                          >
                            Abrir
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => void toggleActive(item)}
                          >
                            {item.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => void removeItem(item)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate ? (
        <div className="modal-overlay" role="presentation" onClick={closeCreate}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pc-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="pc-create-title" className="modal-title">
                Nuevo cliente particular
              </h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeCreate}
                disabled={creating}
              >
                Cerrar
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0 }}>
              Se crea con ubicación GPS y una zona inicial &quot;Principal&quot;. Después podés
              agregar plantas, zonas y subzonas desde la ficha.
            </p>

            {createError ? <div className="alert alert-error">{createError}</div> : null}

            <form onSubmit={handleCreate} className="stack">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                }}
              >
                <div className="form-field" style={{ margin: 0 }}>
                  <label htmlFor="pc-name">Nombre / Razón social *</label>
                  <input
                    id="pc-name"
                    className="input"
                    value={contact.name}
                    onChange={(e) => setContact((f) => ({ ...f, name: e.target.value }))}
                    maxLength={200}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label htmlFor="pc-tax">CUIT</label>
                  <input
                    id="pc-tax"
                    className="input"
                    value={contact.taxId}
                    onChange={(e) => setContact((f) => ({ ...f, taxId: e.target.value }))}
                    maxLength={20}
                  />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label htmlFor="pc-contact">Contacto</label>
                  <input
                    id="pc-contact"
                    className="input"
                    value={contact.contactName}
                    onChange={(e) => setContact((f) => ({ ...f, contactName: e.target.value }))}
                    maxLength={200}
                  />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label htmlFor="pc-email">Correo</label>
                  <input
                    id="pc-email"
                    className="input"
                    type="email"
                    value={contact.email}
                    onChange={(e) => setContact((f) => ({ ...f, email: e.target.value }))}
                    maxLength={200}
                  />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label htmlFor="pc-phone">Teléfono</label>
                  <input
                    id="pc-phone"
                    className="input"
                    value={contact.phone}
                    onChange={(e) => setContact((f) => ({ ...f, phone: e.target.value }))}
                    maxLength={50}
                  />
                </div>
                <div className="form-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label htmlFor="pc-notes">Notas</label>
                  <input
                    id="pc-notes"
                    className="input"
                    value={contact.notes}
                    onChange={(e) => setContact((f) => ({ ...f, notes: e.target.value }))}
                    maxLength={1000}
                  />
                </div>
              </div>

              <BuildingLocationFields
                value={location}
                onChange={(patch) => setLocation((prev) => ({ ...prev, ...patch }))}
              />

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeCreate} disabled={creating}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creando…' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
