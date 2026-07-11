'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import { FinanceSubnav } from '../../../../components/FinanceSubnav';
import { api } from '../../../../lib/api-client';
import type { CommissionSettlementListItem, Paginated } from '../../../../lib/types';

function money(value: number): string {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

export default function RendicionesPage() {
  const [items, setItems] = useState<CommissionSettlementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (beneficiaryName.trim()) params.set('beneficiaryName', beneficiaryName.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await api.get<Paginated<CommissionSettlementListItem>>(
        `/commissions?${params}`,
      );
      setItems(res.data);
      setPages(res.pages);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar rendiciones');
    } finally {
      setLoading(false);
    }
  }, [page, beneficiaryName, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rendiciones</h1>
          <p className="page-subtitle">Todas las rendiciones generadas en el sistema.</p>
        </div>
        <Link href="/gastos-y-comisiones/comisiones" className="btn btn-primary">
          Nueva comisión
        </Link>
      </div>

      <FinanceSubnav />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="search-name">Beneficiario</label>
            <input
              id="search-name"
              value={beneficiaryName}
              onChange={(e) => {
                setPage(1);
                setBeneficiaryName(e.target.value);
              }}
              placeholder="Buscar por nombre"
            />
          </div>
          <div className="form-field">
            <label htmlFor="search-from">Desde</label>
            <input
              id="search-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="search-to">Hasta</label>
            <input
              id="search-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="muted">No hay rendiciones.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Beneficiario</th>
                    <th>Período</th>
                    <th>%</th>
                    <th>Comisión</th>
                    <th>Creada</th>
                    <th>PDF</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.beneficiaryName}</td>
                      <td>
                        {formatStoredCalendarDate(item.dateFrom)} →{' '}
                        {formatStoredCalendarDate(item.dateTo)}
                      </td>
                      <td>{item.percentage}%</td>
                      <td>{money(item.commissionAmount)}</td>
                      <td>{new Date(item.createdAt).toLocaleString('es-AR')}</td>
                      <td>v{item.currentPdfVersion}</td>
                      <td>
                        <Link
                          href={`/gastos-y-comisiones/rendiciones/${item.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Ver
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
                Página {page} de {pages} · {total}
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
    </>
  );
}
