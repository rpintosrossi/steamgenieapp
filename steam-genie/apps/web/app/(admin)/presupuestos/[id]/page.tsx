'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  buildQuotePdfFilename,
  formatQuoteNumber,
  parseQuoteServiceIncludes,
  quoteVatLineLabel,
  type QuoteStatus as SharedQuoteStatus,
} from '@steam-genie/shared-constants';
import { api } from '../../../../lib/api-client';
import { shareQuoteEmail, shareQuoteWhatsApp } from '../../../../lib/quote-share';
import type { Quote, QuoteBranchItem, QuoteInternalPhoto, QuoteStatus } from '../../../../lib/types';
import { QuoteInternalPhotos } from '../../../../components/QuoteInternalPhotos';

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

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [status, setStatus] = useState<QuoteStatus>('COTIZADO');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [branches, setBranches] = useState<QuoteBranchItem[]>([]);
  const [branchId, setBranchId] = useState('');
  const [savingInternalNotes, setSavingInternalNotes] = useState(false);
  const [sharing, setSharing] = useState<'whatsapp' | 'email' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [serviceTime, setServiceTime] = useState('09:00');
  const [dateToAdd, setDateToAdd] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [clientMatches, setClientMatches] = useState<
    Array<{
      id: string;
      name: string;
      address: string | null;
      buildingId: string;
      phone: string | null;
      email: string | null;
    }>
  >([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [particularAction, setParticularAction] = useState<'CREATE_NEW' | 'USE_EXISTING'>(
    'CREATE_NEW',
  );
  const [selectedParticularId, setSelectedParticularId] = useState('');
  const [eventualSiteKind, setEventualSiteKind] = useState<'PARTICULAR' | 'BUILDING'>(
    'PARTICULAR',
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Quote>(`/quotes/${params.id}`);
      setQuote(data);
      setStatus(data.status);
      setBranchId(data.branchId ?? data.branch?.id ?? '');
      setContactPhone(data.contactPhone ?? data.particularClient?.phone ?? '');
      setContactEmail(data.contactEmail ?? data.particularClient?.email ?? '');
      setInternalNotes(data.internalNotes ?? '');
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

  useEffect(() => {
    void api
      .get<QuoteBranchItem[]>('/quote-branches?includeInactive=false')
      .then((rows) => {
        setBranches((prev) => {
          const current = quote?.branch;
          if (current && !rows.some((row) => row.id === current.id)) {
            return [current, ...rows];
          }
          return rows;
        });
      })
      .catch(() => setBranches([]));
  }, [quote?.branch?.id]);

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

  async function saveBranch() {
    if (!quote || !branchId) return;
    setSavingBranch(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.patch<Quote>(`/quotes/${quote.id}`, { branchId });
      setQuote(updated);
      setBranchId(updated.branchId ?? updated.branch?.id ?? branchId);
      setSuccess('Sucursal actualizada. El PDF usará la nueva dirección y teléfono.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la sucursal');
    } finally {
      setSavingBranch(false);
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

  async function saveInternalNotes() {
    if (!quote) return;
    setSavingInternalNotes(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.patch<Quote>(`/quotes/${quote.id}`, {
        internalNotes: internalNotes.trim() || null,
      });
      setQuote(updated);
      setInternalNotes(updated.internalNotes ?? '');
      setSuccess('Observaciones internas guardadas.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar las observaciones');
    } finally {
      setSavingInternalNotes(false);
    }
  }

  async function downloadPdf() {
    if (!quote) return;
    try {
      await api.download(
        `/quotes/${quote.id}/pdf`,
        buildQuotePdfFilename(clientLabel(quote), quote.number),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el PDF');
    }
  }

  async function removeQuote() {
    if (!quote) return;
    const linked = quote.workOrders ?? [];
    const hasCompleted = linked.some((wo) => wo.status === 'COMPLETED');
    if (hasCompleted) {
      setError('No se puede eliminar un presupuesto con servicios completados.');
      return;
    }

    const pendingCount = linked.length;
    const confirmMsg =
      pendingCount > 0
        ? `¿Eliminar el presupuesto ${formatQuoteNumber(quote.number)} y sus ${pendingCount} servicio${pendingCount === 1 ? '' : 's'} asociado${pendingCount === 1 ? '' : 's'}?`
        : `¿Eliminar el presupuesto ${formatQuoteNumber(quote.number)}? Esta acción no se puede deshacer desde la lista.`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/quotes/${quote.id}`);
      router.push('/presupuestos');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el presupuesto');
      setDeleting(false);
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
        clientName: clientLabel(quote),
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
        clientName: clientLabel(quote),
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

  function addSelectedDate() {
    const day = dateToAdd.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      setError('Elegí una fecha válida para agregar.');
      return;
    }
    if (selectedDates.includes(day)) {
      setError('Esa fecha ya está en la lista.');
      return;
    }
    setError(null);
    setSelectedDates((prev) => [...prev, day].sort());
    setDateToAdd('');
  }

  function removeSelectedDate(day: string) {
    setSelectedDates((prev) => prev.filter((d) => d !== day));
  }

  async function handleConvert(e: FormEvent) {
    e.preventDefault();
    if (!quote) return;
    if (selectedDates.length === 0) {
      setError('Agregá al menos una fecha de servicio.');
      return;
    }
    if (!serviceTime) {
      setError('Indicá la hora del servicio.');
      return;
    }
    if (
      quote.eventualClient &&
      eventualSiteKind === 'PARTICULAR' &&
      clientMatches.length > 0 &&
      particularAction === 'USE_EXISTING' &&
      !selectedParticularId
    ) {
      setError('Seleccioná el cliente particular a reutilizar.');
      return;
    }

    setConverting(true);
    setError(null);
    setSuccess(null);
    try {
      const scheduledAts = selectedDates.map((day) => {
        const local = new Date(`${day}T${serviceTime}:00`);
        if (Number.isNaN(local.getTime())) {
          throw new Error(`Fecha/hora inválida: ${day} ${serviceTime}`);
        }
        return local.toISOString();
      });

      const body: {
        scheduledAts: string[];
        eventualSiteKind?: string;
        particularClientAction?: string;
        particularClientId?: string;
      } = { scheduledAts };
      if (quote.eventualClient) {
        body.eventualSiteKind = eventualSiteKind;
        if (eventualSiteKind === 'PARTICULAR' && clientMatches.length > 0) {
          body.particularClientAction = particularAction;
          if (particularAction === 'USE_EXISTING') {
            body.particularClientId = selectedParticularId;
          }
        }
      }

      const result = await api.post<{
        quote: Quote;
        workOrders: Array<{ id: string }>;
        workOrder: { id: string };
        warning?: string;
      }>(`/quotes/${quote.id}/convert-to-work-order`, body);
      setQuote(result.quote);
      setConvertOpen(false);
      const count = result.workOrders?.length ?? 1;
      setSuccess(
        result.warning
          ? result.warning
          : count > 1
            ? `Se crearon ${count} servicios eventuales desde el presupuesto.`
            : 'Servicio eventual creado desde el presupuesto.',
      );
    } catch (err) {
      // El servidor puede haber creado los servicios aunque el cliente no lea la respuesta.
      try {
        const refreshed = await api.get<Quote>(`/quotes/${quote.id}`);
        if ((refreshed.workOrders?.length ?? 0) > 0) {
          setQuote(refreshed);
          setConvertOpen(false);
          const count = refreshed.workOrders!.length;
          setSuccess(
            count > 1
              ? `Se crearon ${count} servicios eventuales desde el presupuesto.`
              : 'Servicio eventual creado desde el presupuesto.',
          );
          setError(null);
          return;
        }
      } catch {
        // ignore refresh error; show original
      }
      setError(err instanceof Error ? err.message : 'No se pudo crear el servicio');
    } finally {
      setConverting(false);
    }
  }

  async function openConvertModal() {
    if (!quote) return;
    setConvertOpen(true);
    setError(null);
    setServiceTime('09:00');
    setDateToAdd('');
    setSelectedDates([]);
    setClientMatches([]);
    setParticularAction('CREATE_NEW');
    setSelectedParticularId('');
    setEventualSiteKind('PARTICULAR');
    if (!quote.eventualClient) return;

    setLoadingMatches(true);
    try {
      const res = await api.get<{
        matches: Array<{
          id: string;
          name: string;
          address: string | null;
          buildingId: string;
          phone: string | null;
          email: string | null;
        }>;
      }>(`/quotes/${quote.id}/particular-client-matches`);
      setClientMatches(res.matches);
      if (res.matches.length > 0) {
        setParticularAction('USE_EXISTING');
        setSelectedParticularId(res.matches[0].id);
      }
    } catch {
      setClientMatches([]);
    } finally {
      setLoadingMatches(false);
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

  const linkedWorkOrders = quote.workOrders ?? [];
  const canConvert = quote.status === 'ACEPTADO' && linkedWorkOrders.length === 0;
  const canDelete = !linkedWorkOrders.some((wo) => wo.status === 'COMPLETED');
  const selectedBranch = branches.find((row) => row.id === branchId) ?? quote.branch;

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
          <Link href={`/presupuestos/${quote.id}/editar`} className="btn btn-secondary">
            Editar
          </Link>
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
            <button type="button" className="btn btn-primary" onClick={() => void openConvertModal()}>
              Crear servicio eventual
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleting}
              onClick={() => void removeQuote()}
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
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

      <div className="card stack" style={{ marginBottom: 16 }}>
        <div>
          <h2 className="card-title" style={{ marginTop: 0, marginBottom: 6 }}>
            Observaciones internas
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Solo para uso interno. No aparecen en el PDF ni se envían al cliente.
          </p>
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <textarea
            id="q-internal-notes"
            className="input"
            rows={4}
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="Notas del equipo, acuerdos, seguimiento…"
            style={{ width: '100%', display: 'block', resize: 'vertical' }}
          />
        </div>
        <QuoteInternalPhotos
          quoteId={quote.id}
          photos={quote.internalPhotos ?? []}
          onPhotosChange={(photos: QuoteInternalPhoto[]) =>
            setQuote((current) => (current ? { ...current, internalPhotos: photos } : current))
          }
          onError={setError}
        />
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingInternalNotes || internalNotes === (quote.internalNotes ?? '')}
            onClick={() => void saveInternalNotes()}
          >
            {savingInternalNotes ? 'Guardando…' : 'Guardar observaciones'}
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
          <div className="form-field" style={{ margin: 0, minWidth: 220 }}>
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
          <div className="form-field" style={{ margin: 0, minWidth: 240 }}>
            <label htmlFor="q-branch">Sucursal</label>
            <select
              id="q-branch"
              className="input"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isDefault ? ' (predeterminada)' : ''}
                </option>
              ))}
            </select>
            {selectedBranch ? (
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                {selectedBranch.address} · Tel: {selectedBranch.phone}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              savingBranch ||
              !branchId ||
              branchId === (quote.branchId ?? quote.branch?.id)
            }
            onClick={() => void saveBranch()}
          >
            {savingBranch ? 'Guardando…' : 'Actualizar sucursal'}
          </button>
          {linkedWorkOrders.length > 0 ? (
            linkedWorkOrders.length === 1 ? (
              <Link
                href={`/trabajos-eventuales/servicios?id=${linkedWorkOrders[0].id}`}
                className="btn btn-ghost"
              >
                Ver servicio asociado
              </Link>
            ) : (
              <>
                {linkedWorkOrders.map((wo, index) => (
                  <Link
                    key={wo.id}
                    href={`/trabajos-eventuales/servicios?id=${wo.id}`}
                    className="btn btn-ghost"
                  >
                    Ver servicio {index + 1}
                  </Link>
                ))}
              </>
            )
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
              {clientKindLabel(quote)}
              {quote.eventualClient?.address
                ? ` · ${quote.eventualClient.address}`
                : ''}
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
            <div className="muted">Sucursal</div>
            <div>{quote.branch?.name ?? '—'}</div>
            {quote.branch ? (
              <div className="muted" style={{ fontSize: 12 }}>
                {quote.branch.address} · Tel: {quote.branch.phone}
              </div>
            ) : null}
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
        {quote.observations ? (
          <p style={{ marginTop: 12 }}>
            <span className="muted">Observaciones (cliente): </span>
            {quote.observations}
          </p>
        ) : null}
        {(quote.payments?.length ?? 0) > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div className="muted">Pagos / medios</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
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
        ) : null}
        <div style={{ marginTop: 12 }}>
          <div className="muted">El servicio incluye</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {parseQuoteServiceIncludes(quote.serviceIncludes).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      {linkedWorkOrders.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="card-title" style={{ marginTop: 0 }}>
            Servicios asociados ({linkedWorkOrders.length})
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {linkedWorkOrders.map((wo) => (
              <li key={wo.id}>
                {wo.title}
                {wo.scheduledDate ? ` · ${formatDate(wo.scheduledDate)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
            {quoteVatLineLabel(quote.vatRate)}: {money(quote.vatAmount)}
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
              {quote.eventualClient
                ? 'Se crea un cliente particular (si corresponde) y un servicio por cada día elegido, en estado Presupuesto aceptado. El checklist se define al asignar el limpiador.'
                : 'Se crea un trabajo eventual por cada día elegido en el sitio del cliente/edificio, con monto y descripción del presupuesto.'}
            </p>
            <form onSubmit={handleConvert} className="stack">
              <div className="form-field">
                <label htmlFor="q-time">Hora del servicio *</label>
                <input
                  id="q-time"
                  className="input"
                  type="time"
                  value={serviceTime}
                  onChange={(e) => setServiceTime(e.target.value)}
                  required
                />
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Se aplica la misma hora a todos los días.
                </p>
              </div>

              <div className="form-field">
                <label htmlFor="q-date-add">Días de servicio *</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    id="q-date-add"
                    className="input"
                    type="date"
                    value={dateToAdd}
                    onChange={(e) => setDateToAdd(e.target.value)}
                    style={{ flex: '1 1 160px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addSelectedDate}
                    disabled={!dateToAdd}
                  >
                    Agregar día
                  </button>
                </div>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Podés agregar varios días sueltos (ej. martes y jueves de esta semana y la próxima).
                </p>
              </div>

              {selectedDates.length > 0 ? (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {selectedDates.map((day) => (
                    <li
                      key={day}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '6px 10px',
                        border: '1px solid var(--border, #e5e7eb)',
                        borderRadius: 6,
                      }}
                    >
                      <span>
                        {formatDate(day)}
                        {serviceTime ? ` · ${serviceTime}` : ''}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeSelectedDate(day)}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Todavía no hay días cargados.
                </p>
              )}

              {quote.eventualClient ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div>
                    <strong>Cliente eventual:</strong> {quote.eventualClient.name}
                    {quote.eventualClient.address
                      ? ` · ${quote.eventualClient.address}`
                      : ''}
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <p style={{ margin: 0 }}>
                      ¿Querés crear un <strong>cliente particular</strong> o un{' '}
                      <strong>edificio</strong> con estos datos?
                    </p>
                    {quote.branch?.name ? (
                      <p className="muted" style={{ margin: 0 }}>
                        Si creás o reutilizás un cliente particular, quedará asociado a la
                        sucursal <strong>{quote.branch.name}</strong>.
                      </p>
                    ) : null}
                    <label className="checkbox-label">
                      <input
                        type="radio"
                        name="eventualSiteKind"
                        checked={eventualSiteKind === 'PARTICULAR'}
                        onChange={() => setEventualSiteKind('PARTICULAR')}
                      />
                      Cliente particular
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="radio"
                        name="eventualSiteKind"
                        checked={eventualSiteKind === 'BUILDING'}
                        onChange={() => setEventualSiteKind('BUILDING')}
                      />
                      Edificio
                    </label>
                  </div>
                  {eventualSiteKind === 'BUILDING' ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Se creará un edificio con este nombre y dirección (sin cliente
                      particular).
                    </p>
                  ) : loadingMatches ? (
                    <p className="muted">Buscando clientes con la misma dirección…</p>
                  ) : clientMatches.length > 0 ? (
                    <div
                      className="stack"
                      style={{
                        padding: 12,
                        border: '1px solid var(--border, #e5e7eb)',
                        borderRadius: 8,
                        background: 'var(--surface-muted, #f9fafb)',
                      }}
                    >
                      <p style={{ margin: 0 }}>
                        Hay {clientMatches.length} cliente
                        {clientMatches.length === 1 ? '' : 's'} particular
                        {clientMatches.length === 1 ? '' : 'es'} con la misma dirección.
                        ¿Qué querés hacer?
                      </p>
                      <label className="checkbox-label">
                        <input
                          type="radio"
                          name="particularAction"
                          checked={particularAction === 'USE_EXISTING'}
                          onChange={() => setParticularAction('USE_EXISTING')}
                        />
                        Usar un cliente ya creado
                      </label>
                      {particularAction === 'USE_EXISTING' ? (
                        <div className="form-field" style={{ margin: 0 }}>
                          <label htmlFor="q-match">Cliente *</label>
                          <select
                            id="q-match"
                            className="input"
                            value={selectedParticularId}
                            onChange={(e) => setSelectedParticularId(e.target.value)}
                            required
                          >
                            {clientMatches.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                                {m.address ? ` — ${m.address}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <label className="checkbox-label">
                        <input
                          type="radio"
                          name="particularAction"
                          checked={particularAction === 'CREATE_NEW'}
                          onChange={() => setParticularAction('CREATE_NEW')}
                        />
                        Crear uno nuevo igualmente
                      </label>
                    </div>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>
                      Se creará un cliente particular nuevo con este nombre y dirección.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConvertOpen(false)}
                  disabled={converting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={converting || loadingMatches || selectedDates.length === 0}
                >
                  {converting
                    ? 'Creando…'
                    : selectedDates.length > 1
                      ? `Crear ${selectedDates.length} servicios`
                      : 'Crear servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
