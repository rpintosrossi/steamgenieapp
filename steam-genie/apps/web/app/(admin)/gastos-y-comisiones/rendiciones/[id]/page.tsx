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

export default function RendicionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<CommissionSettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [percentage, setPercentage] = useState('');
  const [includedMap, setIncludedMap] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.get<CommissionSettlementDetail>(`/commissions/${id}`);
      setData(detail);
      setPercentage(String(detail.percentage));
      const map: Record<string, boolean> = {};
      for (const fe of detail.fixedExpenses) map[fe.id] = fe.included;
      setIncludedMap(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveChanges() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.patch<CommissionSettlementDetail>(`/commissions/${id}`, {
        percentage: Number(percentage),
        fixedExpenses: data.fixedExpenses.map((fe) => ({
          id: fe.id,
          included: includedMap[fe.id] ?? fe.included,
        })),
        versionNote: 'Actualización desde panel de rendiciones',
      });
      setData(updated);
      setPercentage(String(updated.percentage));
      const map: Record<string, boolean> = {};
      for (const fe of updated.fixedExpenses) map[fe.id] = fe.included;
      setIncludedMap(map);
      setSuccess(`Cambios guardados. PDF actualizado a v${updated.currentPdfVersion}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <FinanceSubnav />
        <p className="muted">Cargando…</p>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <FinanceSubnav />
        <div className="alert alert-error">{error ?? 'Rendición no encontrada'}</div>
        <Link href="/gastos-y-comisiones/rendiciones">Volver</Link>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rendición · {data.beneficiaryName}</h1>
          <p className="page-subtitle">
            {formatStoredCalendarDate(data.dateFrom)} → {formatStoredCalendarDate(data.dateTo)} ·
            PDF v{data.currentPdfVersion}
          </p>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              void api.download(
                `/commissions/${data.id}/pdf`,
                `rendicion-${data.id.slice(0, 8)}-v${data.currentPdfVersion}.pdf`,
              )
            }
          >
            Descargar PDF actual
          </button>
          <Link href="/gastos-y-comisiones/rendiciones" className="btn btn-secondary">
            Volver
          </Link>
        </div>
      </div>

      <FinanceSubnav />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Cálculo</h2>
        <ul>
          {(data.calculationBreakdown.lines ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="form-field" style={{ maxWidth: 200 }}>
          <label htmlFor="pct">Porcentaje (%)</label>
          <input
            id="pct"
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
          />
        </div>
        <p>
          Cobrado: {money(data.totalClientCharged)} · Gastos servicios:{' '}
          {money(data.totalServiceExpenses)} · Gastos fijos: {money(data.totalFixedExpenses)} ·
          Neto: {money(data.netAmount)} · <strong>Comisión: {money(data.commissionAmount)}</strong>
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
                <th>Edificio</th>
                <th>Limpiadores</th>
                <th>Cobrado</th>
                <th>Gastos</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatStoredCalendarDate(item.scheduledDate)}</td>
                  <td>{item.title}</td>
                  <td>
                    {item.buildingName}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {[item.city, item.province].filter(Boolean).join(', ')}
                    </div>
                  </td>
                  <td>{item.cleaners.map((c) => c.fullName).join(', ') || '—'}</td>
                  <td>{money(item.clientAmountCharged)}</td>
                  <td>
                    {money(item.serviceExpensesTotal)}
                    {item.serviceExpenses.length > 0 ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.serviceExpenses
                          .map((e) => `${e.concept}: ${money(e.amount)}`)
                          .join(' · ')}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Gastos fijos</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Incluir</th>
                <th>Concepto</th>
                <th>Prorrateado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {data.fixedExpenses.map((fe) => (
                <tr key={fe.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={includedMap[fe.id] ?? fe.included}
                      onChange={(e) =>
                        setIncludedMap((prev) => ({ ...prev, [fe.id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td>
                    {fe.concept}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {fe.isGlobal ? 'Global' : fe.buildingName}
                    </div>
                  </td>
                  <td>{money(fe.proratedAmount)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {fe.prorationNote}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void saveChanges()}
          style={{ marginTop: 12 }}
        >
          {saving ? 'Guardando…' : 'Guardar cambios (nueva versión PDF)'}
        </button>
      </div>

      <div className="card">
        <h2 className="card-title">Versiones de PDF</h2>
        <ul>
          {data.pdfVersions.map((pdf) => (
            <li key={pdf.id}>
              v{pdf.version} · {new Date(pdf.createdAt).toLocaleString('es-AR')}
              {pdf.note ? ` · ${pdf.note}` : ''}{' '}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  void api.download(
                    `/commissions/${data.id}/pdf?version=${pdf.version}`,
                    `rendicion-v${pdf.version}.pdf`,
                  )
                }
              >
                Descargar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
