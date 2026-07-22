'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  formatQuoteNumber,
  type QuoteStatus as SharedQuoteStatus,
} from '@steam-genie/shared-constants';
import { api } from '../../../lib/api-client';
import type { Paginated, Quote, QuoteStatus } from '../../../lib/types';

function money(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value);
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function clientLabel(quote: Quote) {
  if (quote.particularClient) return quote.particularClient.name;
  if (quote.building) return quote.building.name;
  if (quote.eventualClient) return quote.eventualClient.name;
  return '—';
}

function clientKind(quote: Quote) {
  if (quote.particularClient) return 'Particular';
  if (quote.building) return 'Edificio';
  if (quote.eventualClient) return 'Eventual';
  return '—';
}

function formatDate(value: string) {
  const d = value.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return value;
  return `${day}/${m}/${y}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function QuotesPage() {
  const [items, setItems] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (month) params.set('month', month);
      if (status) params.set('status', status);
      const res = await api.get<Paginated<Quote>>(`/quotes?${params}`);
      setItems(res.data);
      setTotal(res.total);
      setPages(Math.max(1, res.pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar presupuestos');
    } finally {
      setLoading(false);
    }
  }, [month, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    void load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Presupuestos</h1>
          <p className="page-subtitle">
            Cotizaciones para clientes particulares o edificios. Generá PDF y convertí aceptados en
            servicios eventuales.
          </p>
        </div>
        <Link href="/presupuestos/nuevo" className="btn btn-primary">
          Nuevo presupuesto
        </Link>
      </div>

      <form onSubmit={applyFilters} className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="q-month">Mes</label>
            <input
              id="q-month"
              className="input"
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="q-status">Condición</label>
            <select
              id="q-status"
              className="input"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as QuoteStatus | '');
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {Object.values(QUOTE_STATUSES).map((key) => (
                <option key={key} value={key}>
                  {QUOTE_STATUS_LABELS[key as SharedQuoteStatus]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            Filtrar
          </button>
        </div>
      </form>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
          </div>
        ) : items.length === 0 ? (
          <p className="empty-state">No hay presupuestos para este filtro.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Condición</th>
                  <th>Fecha</th>
                  <th>Servicio</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((quote) => (
                  <tr key={quote.id}>
                    <td>{formatQuoteNumber(quote.number)}</td>
                    <td>{clientLabel(quote)}</td>
                    <td>{clientKind(quote)}</td>
                    <td>
                      <span className="badge">
                        {QUOTE_STATUS_LABELS[quote.status as SharedQuoteStatus]}
                      </span>
                    </td>
                    <td>{formatDate(quote.requestDate)}</td>
                    <td>{quote.serviceType ?? '—'}</td>
                    <td>{money(quote.total)}</td>
                    <td>
                      <Link href={`/presupuestos/${quote.id}`} className="btn btn-ghost btn-sm">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span className="muted">
              Página {page} de {pages} · {total} presupuestos
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
