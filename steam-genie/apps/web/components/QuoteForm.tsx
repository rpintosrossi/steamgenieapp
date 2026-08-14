'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { QUOTE_VAT_RATE, QUOTE_DEFAULT_SERVICE_INCLUDES, formatQuoteNumber } from '@steam-genie/shared-constants';
import { api } from '../lib/api-client';
import type {
  Building,
  Paginated,
  ParticularClientItem,
  PaymentMethodItem,
  Quote,
  QuoteBranchItem,
  QuoteItemInput,
  QuotePaymentInput,
  UserItem,
} from '../lib/types';

type ClientKind = 'particular' | 'building' | 'eventual';

type DraftItem = {
  quantity: string;
  description: string;
  unitPrice: string;
  discountPercent: string;
};

type DraftPayment = {
  paymentMethodId: string;
  isPending: boolean;
  percent: string;
  note: string;
};

const EMPTY_ITEM: DraftItem = {
  quantity: '1',
  description: '',
  unitPrice: '',
  discountPercent: '',
};

const EMPTY_PAYMENT: DraftPayment = {
  paymentMethodId: '',
  isPending: false,
  percent: '',
  note: '',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function lineTotal(item: DraftItem): number {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unitPrice) || 0;
  const disc = Number(item.discountPercent) || 0;
  const raw = qty * price;
  return Math.round((raw - raw * (disc / 100)) * 100) / 100;
}

function quoteToDraftItems(quote: Quote): DraftItem[] {
  if (!quote.items.length) return [{ ...EMPTY_ITEM }];
  return quote.items.map((item) => ({
    quantity: String(item.quantity),
    description: item.description,
    unitPrice: String(item.unitPrice),
    discountPercent:
      item.discountPercent != null && item.discountPercent !== ''
        ? String(item.discountPercent)
        : '',
  }));
}

function quoteToDraftPayments(quote: Quote): DraftPayment[] {
  if (!quote.payments?.length) return [];
  return quote.payments.map((payment) => ({
    paymentMethodId: payment.paymentMethodId,
    isPending: payment.isPending,
    percent:
      payment.percent != null && payment.percent !== ''
        ? String(payment.percent)
        : '',
    note: payment.note ?? '',
  }));
}

function clientKindFromQuote(quote: Quote): ClientKind {
  if (quote.buildingId) return 'building';
  if (quote.eventualClientId) return 'eventual';
  return 'particular';
}

type QuoteFormProps = {
  mode: 'create' | 'edit';
  initialQuote?: Quote;
};

export function QuoteForm({ mode, initialQuote }: QuoteFormProps) {
  const router = useRouter();
  const hasLinkedServices = Boolean(initialQuote?.workOrders?.length);
  const [clientKind, setClientKind] = useState<ClientKind>(
    initialQuote ? clientKindFromQuote(initialQuote) : 'particular',
  );
  const [particularClientId, setParticularClientId] = useState(
    initialQuote?.particularClientId ?? '',
  );
  const [buildingId, setBuildingId] = useState(initialQuote?.buildingId ?? '');
  const [eventualName, setEventualName] = useState(initialQuote?.eventualClient?.name ?? '');
  const [eventualTaxId, setEventualTaxId] = useState(initialQuote?.eventualClient?.taxId ?? '');
  const [eventualAddress, setEventualAddress] = useState(
    initialQuote?.eventualClient?.address ?? '',
  );
  const [particulars, setParticulars] = useState<ParticularClientItem[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [requestDate, setRequestDate] = useState(
    initialQuote?.requestDate?.slice(0, 10) ?? todayIso(),
  );
  const [serviceType, setServiceType] = useState(initialQuote?.serviceType ?? '');
  const [clientDetails, setClientDetails] = useState(initialQuote?.clientDetails ?? '');
  const [contactPhone, setContactPhone] = useState(
    initialQuote?.contactPhone ?? initialQuote?.particularClient?.phone ?? '',
  );
  const [contactEmail, setContactEmail] = useState(
    initialQuote?.contactEmail ?? initialQuote?.particularClient?.email ?? '',
  );
  const [sellerName, setSellerName] = useState(initialQuote?.sellerName ?? '');
  const [paymentCondition, setPaymentCondition] = useState(
    initialQuote?.paymentCondition ?? 'Contado',
  );
  const [paymentTerms, setPaymentTerms] = useState(
    initialQuote?.paymentTerms ?? '50% DE ANTICIPO EL RESTO A FINALIZAR EL SERVICIO',
  );
  const [observations, setObservations] = useState(
    initialQuote?.observations ?? 'ESTE PRESUPUESTO ES VALIDO POR UN MES',
  );
  const [internalNotes, setInternalNotes] = useState(initialQuote?.internalNotes ?? '');
  const [serviceIncludes, setServiceIncludes] = useState(
    initialQuote?.serviceIncludes?.trim()
      ? initialQuote.serviceIncludes
      : QUOTE_DEFAULT_SERVICE_INCLUDES,
  );
  const [items, setItems] = useState<DraftItem[]>(
    initialQuote ? quoteToDraftItems(initialQuote) : [{ ...EMPTY_ITEM }],
  );
  const [payments, setPayments] = useState<DraftPayment[]>(
    initialQuote ? quoteToDraftPayments(initialQuote) : [],
  );
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [branches, setBranches] = useState<QuoteBranchItem[]>([]);
  const [branchId, setBranchId] = useState(
    initialQuote?.branchId ?? initialQuote?.branch?.id ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactPrefillDone, setContactPrefillDone] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit') return;
    void api
      .get<{ user: UserItem }>('/auth/me')
      .then((session) => {
        if (session.user?.fullName) setSellerName(session.user.fullName);
      })
      .catch(() => undefined);
  }, [mode]);

  useEffect(() => {
    void api
      .get<ParticularClientItem[]>('/particular-clients?includeInactive=false')
      .then(setParticulars)
      .catch(() => setParticulars([]));
    void api
      .get<Paginated<Building>>('/buildings?limit=100')
      .then((res) => setBuildings(res.data))
      .catch(() => setBuildings([]));
    void api
      .get<PaymentMethodItem[]>('/payment-methods?includeInactive=false')
      .then(setPaymentMethods)
      .catch(() => setPaymentMethods([]));
    void api
      .get<QuoteBranchItem[]>('/quote-branches?includeInactive=false')
      .then((rows) => {
        const current = initialQuote?.branch;
        const list =
          current && !rows.some((row) => row.id === current.id)
            ? [current, ...rows]
            : rows;
        setBranches(list);
        setBranchId((prev) => {
          if (prev) return prev;
          const preferred = list.find((row) => row.isDefault) ?? list[0];
          return preferred?.id ?? '';
        });
      })
      .catch(() => setBranches([]));
  }, [initialQuote?.branch]);

  useEffect(() => {
    if (clientKind !== 'particular' || !particularClientId || contactPrefillDone) return;
    const client = particulars.find((c) => c.id === particularClientId);
    if (!client) return;
    setContactPhone(client.phone ?? '');
    setContactEmail(client.email ?? '');
  }, [clientKind, particularClientId, particulars, contactPrefillDone]);

  const totals = useMemo(() => {
    const subtotal = Math.round(items.reduce((acc, item) => acc + lineTotal(item), 0) * 100) / 100;
    const vatAmount = Math.round(subtotal * (QUOTE_VAT_RATE / 100) * 100) / 100;
    return { subtotal, vatAmount, total: Math.round((subtotal + vatAmount) * 100) / 100 };
  }, [items]);

  const selectedBranch = branches.find((row) => row.id === branchId);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updatePayment(index: number, patch: Partial<DraftPayment>) {
    setPayments((prev) =>
      prev.map((payment, i) => (i === index ? { ...payment, ...patch } : payment)),
    );
  }

  function buildPaymentsPayload(): QuotePaymentInput[] | null {
    const payload: QuotePaymentInput[] = [];
    for (const payment of payments) {
      if (!payment.paymentMethodId) {
        setError('Cada línea de pago necesita un método.');
        return null;
      }
      if (payment.isPending) {
        payload.push({
          paymentMethodId: payment.paymentMethodId,
          isPending: true,
          ...(payment.note.trim() ? { note: payment.note.trim() } : {}),
        });
        continue;
      }
      const percent = Number(payment.percent);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        setError('Cada pago abonado necesita un % entre 0.01 y 100.');
        return null;
      }
      payload.push({
        paymentMethodId: payment.paymentMethodId,
        isPending: false,
        percent,
        ...(payment.note.trim() ? { note: payment.note.trim() } : {}),
      });
    }
    const percentSum = payload
      .filter((p) => !p.isPending)
      .reduce((acc, p) => acc + (p.percent ?? 0), 0);
    if (percentSum > 100.001) {
      setError(`La suma de porcentajes abonados no puede superar 100% (ahora ${percentSum}%).`);
      return null;
    }
    return payload;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (clientKind === 'particular' && !particularClientId) {
      setError('Seleccioná un cliente particular.');
      return;
    }
    if (clientKind === 'building' && !buildingId) {
      setError('Seleccioná un edificio.');
      return;
    }
    if (clientKind === 'eventual' && !eventualName.trim()) {
      setError('Ingresá el nombre del cliente eventual.');
      return;
    }
    if (!branchId) {
      setError('Seleccioná una sucursal emisora.');
      return;
    }

    const payloadItems: QuoteItemInput[] = [];
    for (const item of items) {
      if (!item.description.trim()) {
        setError('Cada ítem necesita descripción.');
        return;
      }
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        setError('Revisá cantidad y precio de los ítems.');
        return;
      }
      const discountPercent = item.discountPercent.trim()
        ? Number(item.discountPercent)
        : undefined;
      payloadItems.push({
        quantity,
        description: item.description.trim(),
        unitPrice,
        ...(discountPercent != null && Number.isFinite(discountPercent)
          ? { discountPercent }
          : {}),
      });
    }

    const paymentsPayload = buildPaymentsPayload();
    if (paymentsPayload === null) return;

    setSaving(true);
    try {
      const clientPayload =
        clientKind === 'particular'
          ? {
              particularClientId,
              buildingId: null,
              eventualClientId: null,
            }
          : clientKind === 'building'
            ? {
                buildingId,
                particularClientId: null,
                eventualClientId: null,
              }
            : {
                eventualClient: {
                  name: eventualName.trim(),
                  ...(eventualTaxId.trim() ? { taxId: eventualTaxId.trim() } : {}),
                  address: eventualAddress.trim() || undefined,
                },
                particularClientId: null,
                buildingId: null,
              };

      const body = {
        ...clientPayload,
        branchId,
        requestDate,
        serviceType: serviceType.trim() || null,
        clientDetails: clientDetails.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        sellerName: sellerName.trim() || null,
        paymentCondition: paymentCondition.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        observations: observations.trim() || null,
        internalNotes: internalNotes.trim() || null,
        serviceIncludes: serviceIncludes.trim() || null,
        payments: paymentsPayload,
        items: payloadItems,
      };

      if (mode === 'edit' && initialQuote) {
        const quote = await api.patch<Quote>(`/quotes/${initialQuote.id}`, body);
        router.push(`/presupuestos/${quote.id}`);
      } else {
        const createBody =
          clientKind === 'particular'
            ? { particularClientId }
            : clientKind === 'building'
              ? { buildingId }
              : {
                  eventualClient: {
                    name: eventualName.trim(),
                    ...(eventualTaxId.trim() ? { taxId: eventualTaxId.trim() } : {}),
                    address: eventualAddress.trim() || undefined,
                  },
                };
        const quote = await api.post<Quote>('/quotes', {
          ...createBody,
          branchId,
          requestDate,
          serviceType: serviceType.trim() || undefined,
          clientDetails: clientDetails.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          sellerName: sellerName.trim() || undefined,
          paymentCondition: paymentCondition.trim() || undefined,
          paymentTerms: paymentTerms.trim() || undefined,
          observations: observations.trim() || undefined,
          internalNotes: internalNotes.trim() || undefined,
          serviceIncludes: serviceIncludes.trim() || undefined,
          payments: paymentsPayload,
          items: payloadItems,
        });
        router.push(`/presupuestos/${quote.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === 'edit'
            ? 'No se pudo guardar el presupuesto'
            : 'No se pudo crear el presupuesto',
      );
    } finally {
      setSaving(false);
    }
  }

  const backHref =
    mode === 'edit' && initialQuote
      ? `/presupuestos/${initialQuote.id}`
      : '/presupuestos';
  const title =
    mode === 'edit' && initialQuote
      ? `Editar presupuesto ${formatQuoteNumber(initialQuote.number)}`
      : 'Nuevo presupuesto';
  const subtitle =
    mode === 'edit'
      ? hasLinkedServices
        ? 'Podés editar los datos e ítems. Si cambiás precios, se actualiza el monto del servicio asociado.'
        : 'Modificá cliente, datos e ítems del presupuesto.'
      : 'Asociá un cliente particular, un edificio o un cliente eventual e ingresá los ítems del servicio.';

  return (
    <>
      <div className="page-header">
        <div>
          <Link href={backHref} className="back-link">
            ← {mode === 'edit' ? 'Volver al presupuesto' : 'Volver a presupuestos'}
          </Link>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form onSubmit={handleSubmit} className="stack">
        <div className="card stack">
          <h2 className="card-title" style={{ marginTop: 0 }}>
            Cliente
          </h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label className="checkbox-label">
              <input
                type="radio"
                name="clientKind"
                checked={clientKind === 'particular'}
                onChange={() => {
                  setClientKind('particular');
                  setContactPrefillDone(false);
                }}
              />
              Cliente particular
            </label>
            <label className="checkbox-label">
              <input
                type="radio"
                name="clientKind"
                checked={clientKind === 'building'}
                onChange={() => setClientKind('building')}
              />
              Edificio
            </label>
            <label className="checkbox-label">
              <input
                type="radio"
                name="clientKind"
                checked={clientKind === 'eventual'}
                onChange={() => setClientKind('eventual')}
              />
              Cliente eventual
            </label>
          </div>

          {clientKind === 'particular' ? (
            <div className="form-field">
              <label htmlFor="q-particular">Cliente particular *</label>
              <select
                id="q-particular"
                className="input"
                value={particularClientId}
                onChange={(e) => {
                  setParticularClientId(e.target.value);
                  setContactPrefillDone(false);
                }}
                required
              >
                <option value="">Seleccionar…</option>
                {particulars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {clientKind === 'building' ? (
            <div className="form-field">
              <label htmlFor="q-building">Edificio *</label>
              <select
                id="q-building"
                className="input"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                required
              >
                <option value="">Seleccionar…</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {clientKind === 'eventual' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <div className="form-field" style={{ margin: 0 }}>
                <label htmlFor="q-eventual-name">Nombre *</label>
                <input
                  id="q-eventual-name"
                  className="input"
                  value={eventualName}
                  onChange={(e) => setEventualName(e.target.value)}
                  placeholder="Nombre del cliente"
                  required
                />
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label htmlFor="q-eventual-tax">CUIT</label>
                <input
                  id="q-eventual-tax"
                  className="input"
                  value={eventualTaxId}
                  onChange={(e) => setEventualTaxId(e.target.value)}
                  placeholder="Opcional"
                  maxLength={20}
                />
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label htmlFor="q-eventual-address">Dirección</label>
                <input
                  id="q-eventual-address"
                  className="input"
                  value={eventualAddress}
                  onChange={(e) => setEventualAddress(e.target.value)}
                  placeholder="Dirección del servicio"
                />
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <div className="form-field" style={{ margin: 0 }}>
              <label htmlFor="q-date">Fecha solicitud *</label>
              <input
                id="q-date"
                className="input"
                type="date"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
                required
              />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label htmlFor="q-branch">Sucursal *</label>
              {branches.length === 0 ? (
                <p className="muted" style={{ margin: '8px 0 0' }}>
                  No hay sucursales. Crealas en{' '}
                  <Link href="/configuracion/sucursales">Configuración</Link>.
                </p>
              ) : (
                <select
                  id="q-branch"
                  className="input"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  required
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.isDefault ? ' (predeterminada)' : ''}
                    </option>
                  ))}
                </select>
              )}
              {selectedBranch ? (
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                  {selectedBranch.address} · Tel: {selectedBranch.phone}
                </p>
              ) : null}
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label htmlFor="q-seller">Vendedor</label>
              <input
                id="q-seller"
                className="input"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="Se completa con tu usuario"
              />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label htmlFor="q-pay-cond">Condición de pago</label>
              <input
                id="q-pay-cond"
                className="input"
                value={paymentCondition}
                onChange={(e) => setPaymentCondition(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
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
          </div>

          <div className="form-field">
            <label htmlFor="q-service">Tipo de servicio</label>
            <input
              id="q-service"
              className="input"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              placeholder="Ej: Limpieza general de depto"
            />
          </div>
          <div className="form-field">
            <label htmlFor="q-details">Detalles del cliente</label>
            <textarea
              id="q-details"
              className="input"
              rows={3}
              value={clientDetails}
              onChange={(e) => setClientDetails(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="q-terms">Forma de pago</label>
            <input
              id="q-terms"
              className="input"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="q-obs">Observaciones (cliente / PDF)</label>
            <input
              id="q-obs"
              className="input"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="q-internal">Observaciones internas</label>
            <textarea
              id="q-internal"
              className="input"
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Solo visibles en el panel, no van al PDF ni al cliente"
            />
          </div>
          <div className="form-field">
            <label htmlFor="q-includes">El servicio incluye</label>
            <textarea
              id="q-includes"
              className="input"
              rows={4}
              value={serviceIncludes}
              onChange={(e) => setServiceIncludes(e.target.value)}
              placeholder="Una línea por ítem"
            />
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              Una línea por punto. Aparece en el PDF bajo “EL SERVICIO INCLUYE”.
            </p>
          </div>
        </div>

        <div className="card stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              Pagos / medios
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPayments((prev) => [...prev, { ...EMPTY_PAYMENT }])}
              disabled={paymentMethods.length === 0}
            >
              Agregar medio
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Registrá % ya abonado por medio, o marcá un medio como pendiente. No aparece en el PDF.
          </p>
          {paymentMethods.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No hay métodos activos. Creálos en{' '}
              <Link href="/presupuestos/metodos-pago">Métodos de pago</Link>.
            </p>
          ) : null}
          {payments.map((payment, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 110px 100px 1fr auto',
                gap: 8,
                alignItems: 'end',
              }}
            >
              <div className="form-field" style={{ margin: 0 }}>
                <label>Método</label>
                <select
                  className="input"
                  value={payment.paymentMethodId}
                  onChange={(e) =>
                    updatePayment(index, { paymentMethodId: e.target.value })
                  }
                >
                  <option value="">Seleccionar…</option>
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label htmlFor={`pay-pending-${index}`}>Pendiente</label>
                <label className="checkbox-label" style={{ marginTop: 8 }}>
                  <input
                    id={`pay-pending-${index}`}
                    type="checkbox"
                    checked={payment.isPending}
                    onChange={(e) =>
                      updatePayment(index, {
                        isPending: e.target.checked,
                        percent: e.target.checked ? '' : payment.percent,
                      })
                    }
                  />
                  Sí
                </label>
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label>% abonado</label>
                <input
                  className="input"
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={payment.percent}
                  disabled={payment.isPending}
                  onChange={(e) => updatePayment(index, { percent: e.target.value })}
                  placeholder="50"
                />
              </div>
              <div className="form-field" style={{ margin: 0 }}>
                <label>Nota</label>
                <input
                  className="input"
                  value={payment.note}
                  onChange={(e) => updatePayment(index, { note: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div className="card stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              Ítems
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
            >
              Agregar ítem
            </button>
          </div>

          {hasLinkedServices ? (
            <p className="muted" style={{ margin: 0 }}>
              Este presupuesto ya tiene servicio asociado: al guardar, el monto cobrado del
              servicio se actualiza con el nuevo total.
            </p>
          ) : null}

          {items.map((item, index) => (
            <div
              key={index}
              className="stack"
              style={{
                gap: 8,
                paddingBottom: 12,
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div className="form-field" style={{ margin: 0 }}>
                <label htmlFor={`quote-item-desc-${index}`}>Descripción</label>
                <textarea
                  id={`quote-item-desc-${index}`}
                  className="input"
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                  required
                  maxLength={5000}
                  rows={5}
                  style={{
                    minHeight: 120,
                    resize: 'vertical',
                    lineHeight: 1.4,
                  }}
                />
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  {item.description.length}/5000
                </p>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 120px 90px auto',
                  gap: 8,
                  alignItems: 'end',
                }}
              >
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Cant.</label>
                  <input
                    className="input"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Precio</label>
                  <input
                    className="input"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>% Bonif.</label>
                  <input
                    className="input"
                    value={item.discountPercent}
                    onChange={(e) => updateItem(index, { discountPercent: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  style={{ marginBottom: 2 }}
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}

          <div style={{ textAlign: 'right' }}>
            <div>Subtotal: {money(totals.subtotal)}</div>
            <div>
              IVA ({QUOTE_VAT_RATE}%): {money(totals.vatAmount)}
            </div>
            <strong>Total: {money(totals.total)}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? mode === 'edit'
                ? 'Guardando…'
                : 'Creando…'
              : mode === 'edit'
                ? 'Guardar cambios'
                : 'Crear presupuesto'}
          </button>
          {mode === 'edit' && initialQuote ? (
            <Link href={`/presupuestos/${initialQuote.id}`} className="btn btn-ghost">
              Cancelar
            </Link>
          ) : null}
        </div>
      </form>
    </>
  );
}
