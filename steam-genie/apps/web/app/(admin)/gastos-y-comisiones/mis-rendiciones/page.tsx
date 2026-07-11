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

export default function MisRendicionesPage() {
  const [items, setItems] = useState<CommissionSettlementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Paginated<CommissionSettlementListItem>>(
        '/commissions/mine?limit=50',
      );
      setItems(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis rendiciones</h1>
          <p className="page-subtitle">Consultá y descargá tus rendiciones de comisiones.</p>
        </div>
      </div>

      <FinanceSubnav />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="muted">Todavía no tenés rendiciones.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>%</th>
                  <th>Comisión</th>
                  <th>PDF</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {formatStoredCalendarDate(item.dateFrom)} →{' '}
                      {formatStoredCalendarDate(item.dateTo)}
                    </td>
                    <td>{item.percentage}%</td>
                    <td>{money(item.commissionAmount)}</td>
                    <td>v{item.currentPdfVersion}</td>
                    <td>
                      <div className="table-row-actions">
                        <Link
                          href={`/gastos-y-comisiones/mis-rendiciones/${item.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Ver
                        </Link>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            void api.download(
                              `/commissions/mine/${item.id}/pdf`,
                              `mi-rendicion-v${item.currentPdfVersion}.pdf`,
                            )
                          }
                        >
                          PDF
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
