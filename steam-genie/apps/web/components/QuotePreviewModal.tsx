'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  QUOTE_STATUS_LABELS,
  buildQuotePdfFilename,
  formatQuoteNumber,
  quoteVatLineLabel,
  type QuoteStatus as SharedQuoteStatus,
} from '@steam-genie/shared-constants';
import { api } from '../lib/api-client';
import { WORK_ORDER_STATUS_LABELS } from '../lib/labels';
import type { Quote } from '../lib/types';

function money(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value);
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = value.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return value;
  return `${day}/${m}/${y}`;
}

function clientLabel(quote: Quote) {
  if (quote.particularClient) return quote.particularClient.name;
  if (quote.building) return quote.building.name;
  if (quote.eventualClient) return quote.eventualClient.name;
  return '—';
}

function clientKindLabel(quote: Quote) {
  if (quote.particularClient) return 'Particular';
  if (quote.building) return 'Edificio';
  if (quote.eventualClient) return 'Eventual';
  return '—';
}

export function QuotePreviewModal({
  quoteId,
  onClose,
}: {
  quoteId: string;
  onClose: () => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Quote>(`/quotes/${quoteId}`);
      setQuote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el presupuesto');
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function downloadPdf() {
    if (!quote) return;
    setDownloading(true);
    setError(null);
    try {
      await api.download(
        `/quotes/${quote.id}/pdf`,
        buildQuotePdfFilename(clientLabel(quote), quote.number),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el PDF');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide quote-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="quote-preview-title" className="modal-title">
              {quote
                ? `Presupuesto ${formatQuoteNumber(quote.number)}`
                : 'Vista previa'}
            </h2>
            {quote ? (
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {clientLabel(quote)} · {formatDate(quote.requestDate)} ·{' '}
                {QUOTE_STATUS_LABELS[quote.status as SharedQuoteStatus]}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
          </div>
        ) : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        {quote ? (
          <>
            <div className="quote-preview-actions">
              <Link href={`/presupuestos/${quote.id}/editar`} className="btn btn-secondary btn-sm">
                Editar
              </Link>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={downloading}
                onClick={() => void downloadPdf()}
              >
                {downloading ? 'Descargando…' : 'PDF'}
              </button>
              <Link href={`/presupuestos/${quote.id}`} className="btn btn-ghost btn-sm">
                Abrir página completa
              </Link>
            </div>

            <div className="quote-preview-grid">
              <div>
                <div className="muted">Cliente</div>
                <div>
                  {clientLabel(quote)}{' '}
                  <span className="badge">{clientKindLabel(quote)}</span>
                </div>
              </div>
              <div>
                <div className="muted">Tipo de servicio</div>
                <div>{quote.serviceType ?? '—'}</div>
              </div>
              <div>
                <div className="muted">Sucursal</div>
                <div>{quote.branch?.name ?? '—'}</div>
              </div>
              <div>
                <div className="muted">Forma de pago</div>
                <div>{quote.paymentTerms ?? '—'}</div>
              </div>
            </div>

            {(quote.payments?.length ?? 0) > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div className="muted">Pagos / medios</div>
                <ul className="quote-preview-payments">
                  {quote.payments!.map((payment) => (
                    <li key={payment.id}>
                      {payment.paymentMethod?.name ?? 'Método'}
                      {payment.isPending
                        ? ' · Pendiente'
                        : ` · ${Number(payment.percent)}% abonado`}
                      {payment.note ? ` · ${payment.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 16 }}>
                Sin medios de pago registrados.
              </p>
            )}

            {quote.internalNotes ? (
              <p style={{ marginTop: 12 }}>
                <span className="muted">Notas internas: </span>
                {quote.internalNotes}
              </p>
            ) : null}

            {(quote.workOrders?.length ?? 0) > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div className="muted">Servicios asociados</div>
                <ul className="quote-preview-payments">
                  {quote.workOrders!.map((wo) => (
                    <li key={wo.id}>
                      {wo.title}
                      {wo.scheduledDate ? ` · ${formatDate(wo.scheduledDate)}` : ''}
                      {' · '}
                      {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 16 }}>
                Todavía no tiene servicio eventual asociado.
              </p>
            )}

            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Cant.</th>
                    <th>Descripción</th>
                    <th>Precio</th>
                    <th>% Bonif.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        Sin ítems
                      </td>
                    </tr>
                  ) : (
                    quote.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.quantity}</td>
                        <td>{item.description}</td>
                        <td>{money(item.unitPrice)}</td>
                        <td>{item.discountPercent ?? '—'}</td>
                        <td>{money(item.lineTotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ textAlign: 'right', marginTop: 12 }}>
              <div>Subtotal: {money(quote.subtotal)}</div>
              <div>
                {quoteVatLineLabel(quote.vatRate)}: {money(quote.vatAmount)}
              </div>
              <strong>Total: {money(quote.total)}</strong>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
