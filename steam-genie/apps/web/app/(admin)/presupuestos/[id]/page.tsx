'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  formatQuoteNumber,
  type QuoteStatus as SharedQuoteStatus,
} from '@steam-genie/shared-constants';
import { api } from '../../../../lib/api-client';
import { shareQuoteEmail, shareQuoteWhatsApp } from '../../../../lib/quote-share';
import type { Quote, QuoteStatus } from '../../../../lib/types';

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
  return '—';
}

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [status, setStatus] = useState<QuoteStatus>('COTIZADO');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [sharing, setSharing] = useState<'whatsapp' | 'email' | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Quote>(`/quotes/${params.id}`);
      setQuote(data);
      setStatus(data.status);
      setContactPhone(data.contactPhone ?? data.particularClient?.phone ?? '');
      setContactEmail(data.contactEmail ?? data.particularClient?.email ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el presupuesto');
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStatus() {
    if (!quote) return;
    setSavingStatus(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.patch<Quote>(`/quotes/${quote.id}`, { status });
      setQuote(updated);
      setSuccess('Condición actualizada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveContact() {
    if (!quote) return;
    setSavingContact(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.patch<Quote>(`/quotes/${quote.id}`, {
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
      });
      setQuote(updated);
      setContactPhone(updated.contactPhone ?? '');
      setContactEmail(updated.contactEmail ?? '');
      setSuccess(
        updated.particularClientId
          ? 'Contacto guardado (también en el cliente particular).'
          : 'Contacto guardado.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el contacto');
    } finally {
      setSavingContact(false);
    }
  }

  async function downloadPdf() {
    if (!quote) return;
    try {
      await api.download(
        `/quotes/${quote.id}/pdf`,
        `presupuesto-${formatQuoteNumber(quote.number)}.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el PDF');
    }
  }

  async function openWhatsApp() {
    if (!quote) return;
    if (!contactPhone.trim()) {
      setError('Cargá y guardá el celular del cliente antes de abrir WhatsApp.');
      return;
    }
    setSharing('whatsapp');
    setError(null);
    setSuccess(null);
    try {
      if (
        contactPhone.trim() !== (quote.contactPhone ?? '') ||
        contactEmail.trim() !== (quote.contactEmail ?? '')
      ) {
        await saveContact();
      }
      const msg = await shareQuoteWhatsApp({
        id: quote.id,
        number: quote.number,
        total: quote.total,
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
      });
      setSuccess(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir WhatsApp');
    } finally {
      setSharing(null);
    }
  }

  async function openMail() {
    if (!quote) return;
    if (!contactEmail.trim()) {
      setError('Cargá y guardá el correo del cliente antes de abrir el mail.');
      return;
    }
    setSharing('email');
    setError(null);
    setSuccess(null);
    try {
      if (
        contactPhone.trim() !== (quote.contactPhone ?? '') ||
        contactEmail.trim() !== (quote.contactEmail ?? '')
      ) {
        const updated = await api.patch<Quote>(`/quotes/${quote.id}`, {
          contactPhone: contactPhone.trim() || null,
          contactEmail: contactEmail.trim() || null,
        });
        setQuote(updated);
      }
      const msg = await shareQuoteEmail({
        id: quote.id,
        number: quote.number,
        total: quote.total,
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
      });
      setSuccess(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el correo');
    } finally {
      setSharing(null);
    }
  }

  async function handleConvert(e: FormEvent) {
    e.preventDefault();
    if (!quote || !scheduledAt) return;
    setConverting(true);
    setError(null);
    setSuccess(null);
    try {
      const iso = new Date(scheduledAt).toISOString();
      const result = await api.post<{
        quote: Quote;
        workOrder: { id: string };
        warning?: string;
      }>(`/quotes/${quote.id}/convert-to-work-order`, { scheduledAt: iso });
      setQuote(result.quote);
      setConvertOpen(false);
      setSuccess(
        result.warning
          ? `Servicio creado. ${result.warning}`
          : 'Servicio eventual creado desde el presupuesto.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el servicio');
    } finally {
      setConverting(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" role="status" aria-label="Cargando" />
      </div>
    );
  }

  if (!quote) {
    return (
      <>
        <Link href="/presupuestos" className="back-link">
          ← Volver
        </Link>
        <div className="alert alert-error">{error ?? 'Presupuesto no encontrado'}</div>
      </>
    );
  }

  const canConvert = quote.status === 'ACEPTADO' && !quote.workOrderId;

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/presupuestos" className="back-link">
            ← Volver a presupuestos
          </Link>
          <h1 className="page-title">Presupuesto {formatQuoteNumber(quote.number)}</h1>
          <p className="page-subtitle">
            {clientLabel(quote)} · {formatDate(quote.requestDate)} ·{' '}
            {QUOTE_STATUS_LABELS[quote.status as SharedQuoteStatus]}
          </p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => void downloadPdf()}>
            Descargar PDF
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={sharing !== null}
            onClick={() => void openWhatsApp()}
          >
            {sharing === 'whatsapp' ? 'Abriendo…' : 'WhatsApp'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={sharing !== null}
            onClick={() => void openMail()}
          >
            {sharing === 'email' ? 'Abriendo…' : 'Correo'}
          </button>
          {canConvert ? (
            <button type="button" className="btn btn-primary" onClick={() => setConvertOpen(true)}>
              Crear servicio eventual
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title" style={{ marginTop: 0 }}>
          Contacto para envío
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Celular y correo se usan para WhatsApp y mail. En celular/móvil, si el sistema lo permite,
          se comparte el PDF adjunto; si no, se descarga y se abre la conversación para adjuntarlo.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="q-phone">Celular (WhatsApp)</label>
            <input
              id="q-phone"
              className="input"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Ej: 11 2345-6789"
            />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="q-email">Correo</label>
            <input
              id="q-email"
              className="input"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="cliente@email.com"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingContact}
            onClick={() => void saveContact()}
          >
            {savingContact ? 'Guardando…' : 'Guardar contacto'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="q-status">Condición</label>
            <select
              id="q-status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as QuoteStatus)}
            >
              {Object.values(QUOTE_STATUSES).map((key) => (
                <option key={key} value={key}>
                  {QUOTE_STATUS_LABELS[key as SharedQuoteStatus]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingStatus || status === quote.status}
            onClick={() => void saveStatus()}
          >
            {savingStatus ? 'Guardando…' : 'Actualizar condición'}
          </button>
          {quote.workOrder ? (
            <Link
              href="/trabajos-eventuales/servicios"
              className="btn btn-ghost"
            >
              Ver servicio asociado
            </Link>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title" style={{ marginTop: 0 }}>
          Datos
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <div className="muted">Cliente</div>
            <div>{clientLabel(quote)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {quote.particularClient ? 'Particular' : 'Edificio'}
            </div>
          </div>
          <div>
            <div className="muted">Tipo de servicio</div>
            <div>{quote.serviceType ?? '—'}</div>
          </div>
          <div>
            <div className="muted">Vendedor</div>
            <div>{quote.sellerName ?? '—'}</div>
          </div>
          <div>
            <div className="muted">Forma de pago</div>
            <div>{quote.paymentTerms ?? '—'}</div>
          </div>
        </div>
        {quote.clientDetails ? (
          <p style={{ marginTop: 12 }}>
            <span className="muted">Detalles: </span>
            {quote.clientDetails}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginTop: 0 }}>
          Ítems
        </h2>
        <div className="table-wrap">
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
              {quote.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.quantity}</td>
                  <td>{item.description}</td>
                  <td>{money(item.unitPrice)}</td>
                  <td>{item.discountPercent ?? '—'}</td>
                  <td>{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <div>Subtotal: {money(quote.subtotal)}</div>
          <div>
            IVA ({quote.vatRate}%): {money(quote.vatAmount)}
          </div>
          <strong>Total: {money(quote.total)}</strong>
        </div>
      </div>

      {convertOpen ? (
        <div className="modal-overlay" role="presentation" onClick={() => setConvertOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Crear servicio eventual</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setConvertOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <p className="muted">
              Se crea un trabajo eventual en el sitio del cliente/edificio, con monto y descripción
              del presupuesto.
            </p>
            <form onSubmit={handleConvert} className="stack">
              <div className="form-field">
                <label htmlFor="q-scheduled">Fecha y hora del servicio *</label>
                <input
                  id="q-scheduled"
                  className="input"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConvertOpen(false)}
                  disabled={converting}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={converting}>
                  {converting ? 'Creando…' : 'Crear servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
