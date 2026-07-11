'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import { FinanceSubnav } from '../../../../components/FinanceSubnav';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import type { FixedExpenseItem } from '../../../../lib/types';

function money(value: number): string {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

export default function GastosFijosPage() {
  const [items, setItems] = useState<FixedExpenseItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(true);

  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        includeInactive: includeInactive ? 'true' : 'false',
      });
      const data = await api.get<FixedExpenseItem[]>(`/fixed-expenses?${params}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar gastos fijos');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void fetchBuildingsList().then(setBuildings).catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!concept.trim() || !amount.trim() || !startDate) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/fixed-expenses', {
        concept: concept.trim(),
        amount: Number(amount),
        startDate,
        endDate: endDate || null,
        buildingId: buildingId || null,
      });
      setConcept('');
      setAmount('');
      setStartDate('');
      setEndDate('');
      setBuildingId('');
      setSuccess('Gasto fijo creado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(item: FixedExpenseItem) {
    try {
      await api.patch(`/fixed-expenses/${item.id}`, { isActive: !item.isActive });
      setSuccess(item.isActive ? 'Desactivado.' : 'Activado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    }
  }

  async function removeItem(item: FixedExpenseItem) {
    if (!window.confirm(`¿Eliminar "${item.concept}"?`)) return;
    try {
      await api.delete(`/fixed-expenses/${item.id}`);
      setSuccess('Eliminado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gastos fijos</h1>
          <p className="page-subtitle">
            Globales o por edificio. Si no tienen fecha de fin, aplican de forma indefinida.
          </p>
        </div>
      </div>

      <FinanceSubnav />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleCreate} className="stack" style={{ gap: 12 }}>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="fe-concept">Concepto</label>
              <input
                id="fe-concept"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="fe-amount">Monto</label>
              <input
                id="fe-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="fe-start">Desde</label>
              <input
                id="fe-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="fe-end">Hasta (opcional)</label>
              <input
                id="fe-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="fe-building">Alcance</label>
              <select
                id="fe-building"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
              >
                <option value="">Global (todos los edificios)</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando…' : 'Crear gasto fijo'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <label className="checkbox-item" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>Mostrar inactivos</span>
        </label>

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="muted">No hay gastos fijos.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Vigencia</th>
                  <th>Alcance</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.concept}</td>
                    <td>{money(item.amount)}</td>
                    <td>
                      {formatStoredCalendarDate(item.startDate)} →{' '}
                      {item.endDate
                        ? formatStoredCalendarDate(item.endDate)
                        : 'Sin fin'}
                    </td>
                    <td>
                      {item.scope === 'global'
                        ? 'Global'
                        : item.building?.name ?? 'Edificio'}
                    </td>
                    <td>
                      <span className="badge">{item.isActive ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td>
                      <div className="table-row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void toggleActive(item)}
                        >
                          {item.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void removeItem(item)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
