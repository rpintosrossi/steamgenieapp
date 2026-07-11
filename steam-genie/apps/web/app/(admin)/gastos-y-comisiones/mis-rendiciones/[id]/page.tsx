'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatStoredCalendarDate } from '@steam-genie/shared-constants';
import { FinanceSubnav } from '../../../../../components/FinanceSubnav';
import { api } from '../../../../../lib/api-client';
import type { CommissionSettlementDetail } from '../../../../../lib/types';

function money(value: number): string {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

export default function MiRendicionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<CommissionSettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.get<CommissionSettlementDetail>(`/commissions/mine/${id}`);
      setData(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="muted">Cargando…</p>;
  if (!data) {
    return (
      <>
        <div className="alert alert-error">{error ?? 'No encontrada'}</div>
        <Link href="/gastos-y-comisiones/mis-rendiciones">Volver</Link>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mi rendición</h1>
          <p className="page-subtitle">
            {formatStoredCalendarDate(data.dateFrom)} → {formatStoredCalendarDate(data.dateTo)}
          </p>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              void api.download(
                `/commissions/mine/${data.id}/pdf`,
                `mi-rendicion-v${data.currentPdfVersion}.pdf`,
              )
            }
          >
            Descargar PDF
          </button>
          <Link href="/gastos-y-comisiones/mis-rendiciones" className="btn btn-secondary">
            Volver
          </Link>
        </div>
      </div>

      <FinanceSubnav />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Cálculo</h2>
        <ul>
          {(data.calculationBreakdown.lines ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          <strong>Comisión: {money(data.commissionAmount)}</strong> · PDF v
          {data.currentPdfVersion}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Servicios</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Servicio</th>
                <th>Cobrado</th>
                <th>Gastos</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatStoredCalendarDate(item.scheduledDate)}</td>
                  <td>
                    {item.title}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {item.buildingName}
                    </div>
                  </td>
                  <td>{money(item.clientAmountCharged)}</td>
                  <td>{money(item.serviceExpensesTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Gastos fijos incluidos</h2>
        <ul>
          {data.fixedExpenses
            .filter((fe) => fe.included)
            .map((fe) => (
              <li key={fe.id}>
                {fe.concept}: {money(fe.proratedAmount)}
                {fe.prorationNote ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {fe.prorationNote}
                  </div>
                ) : null}
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}
