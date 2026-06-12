'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import type { Building, Paginated } from '../../../lib/types';

export default function BuildingsPage() {
  const [items, setItems] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Paginated<Building>>('/buildings?limit=100');
      setItems(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar edificios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/buildings', {
        name,
        address: address || undefined,
        city: city || undefined,
      });
      setName('');
      setAddress('');
      setCity('');
      setSuccess('Edificio creado correctamente.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el edificio');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Edificios</h1>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card">
        <h2 className="card-title">Nuevo edificio</h2>
        <form onSubmit={handleCreate} className="grid-3">
          <div className="form-field">
            <label>Nombre *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Dirección</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Ciudad</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear edificio'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Listado</h2>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="muted">No hay edificios cargados.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ciudad</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.city ?? '—'}</td>
                  <td>{item.address ?? '—'}</td>
                  <td>
                    <span className={`badge ${item.isActive === false ? '' : 'badge-success'}`}>
                      {item.isActive === false ? 'Inactivo' : 'Activo'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/buildings/${item.id}`}>Gestionar jerarquía →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
