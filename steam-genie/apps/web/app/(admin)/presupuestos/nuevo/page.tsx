'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { QUOTE_VAT_RATE } from '@steam-genie/shared-constants';
import { api } from '../../../../lib/api-client';
import type {
  Building,
  Paginated,
  ParticularClientItem,
  Quote,
  QuoteItemInput,
  UserItem,
} from '../../../../lib/types';

type ClientKind = 'particular' | 'building' | 'eventual';

type DraftItem = {
  quantity: string;
  description: string;
  unitPrice: string;
  discountPercent: string;
};

const EMPTY_ITEM: DraftItem = {
  quantity: '1',
  description: '',
  unitPrice: '',
  discountPercent: '',
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

export default function NewQuotePage() {
  const router = useRouter();
  const [clientKind, setClientKind] = useState<ClientKind>('particular');
  const [particularClientId, setParticularClientId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [eventualName, setEventualName] = useState('');
  const [eventualAddress, setEventualAddress] = useState('');
  const [particulars, setParticulars] = useState<ParticularClientItem[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [requestDate, setRequestDate] = useState(todayIso());
  const [serviceType, setServiceType] = useState('');
  const [clientDetails, setClientDetails] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [paymentCondition, setPaymentCondition] = useState('Contado');
  const [paymentTerms, setPaymentTerms] = useState(
    '50% DE ANTICIPO EL RESTO A FINALIZAR EL SERVICIO',
  );
  const [observations, setObservations] = useState('ESTE PRESUPUESTO ES VALIDO POR UN MES');
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ user: UserItem }>('/auth/me')
      .then((session) => {
        if (session.user?.fullName) setSellerName(session.user.fullName);
      })
      .catch(() => undefined);
    void api
      .get<ParticularClientItem[]>('/particular-clients?includeInactive=false')
      .then(setParticulars)
      .catch(() => setParticulars([]));
    void api
      .get<Paginated<Building>>('/buildings?limit=100')
      .then((res) => setBuildings(res.data))
      .catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    if (clientKind !== 'particular' || !particularClientId) return;
    const client = particulars.find((c) => c.id === particularClientId);
    if (!client) return;
    setContactPhone(client.phone ?? '');
    setContactEmail(client.email ?? '');
  }, [clientKind, particularClientId, particulars]);

  const totals = useMemo(() => {
    const subtotal = Math.round(items.reduce((acc, item) => acc + lineTotal(item), 0) * 100) / 100;
    const vatAmount = Math.round(subtotal * (QUOTE_VAT_RATE / 100) * 100) / 100;
    return { subtotal, vatAmount, total: Math.round((subtotal + vatAmount) * 100) / 100 };
  }, [items]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
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

    const payloadItems: QuoteItemInput[] = [];
    for (const item of items) {
      if (!item.description.trim()) {
        setError('Cada ítem necesita descripción.');
        return;
      }
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
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

    setCreating(true);
    try {
      const clientPayload =
        clientKind === 'particular'
          ? { particularClientId }
          : clientKind === 'building'
            ? { buildingId }
            : {
                eventualClient: {
                  name: eventualName.trim(),
                  address: eventualAddress.trim() || undefined,
                },
              };

      const quote = await api.post<Quote>('/quotes', {
        ...clientPayload,
        requestDate,
        serviceType: serviceType.trim() || undefined,
        clientDetails: clientDetails.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        sellerName: sellerName.trim() || undefined,
        paymentCondition: paymentCondition.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        observations: observations.trim() || undefined,
        items: payloadItems,
      });
      router.push(`/presupuestos/${quote.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el presupuesto');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/presupuestos" className="back-link">
            ← Volver a presupuestos
          </Link>
          <h1 className="page-title">Nuevo presupuesto</h1>
          <p className="page-subtitle">
            Asociá un cliente particular, un edificio o un cliente eventual e ingresá los ítems
            del servicio.
          </p>
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
                onChange={() => setClientKind('particular')}
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
                onChange={(e) => setParticularClientId(e.target.value)}
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
            <label htmlFor="q-obs">Observaciones</label>
            <input
              id="q-obs"
              className="input"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </div>
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

          {items.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 120px 90px auto',
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
                <label>Descripción</label>
                <input
                  className="input"
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
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
          ))}

          <div style={{ textAlign: 'right' }}>
            <div>Subtotal: {money(totals.subtotal)}</div>
            <div>
              IVA ({QUOTE_VAT_RATE}%): {money(totals.vatAmount)}
            </div>
            <strong>Total: {money(totals.total)}</strong>
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creando…' : 'Crear presupuesto'}
          </button>
        </div>
      </form>
    </>
  );
}
