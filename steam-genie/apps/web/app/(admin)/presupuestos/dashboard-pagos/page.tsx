'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  QUOTE_STATUS_LABELS,
  formatQuoteNumber,
  type QuoteStatus as SharedQuoteStatus,
} from '@steam-genie/shared-constants';
import { QuotesSubnav } from '../../../../components/QuotesSubnav';
import { QuotePaymentsPieChart } from '../../../../components/QuotePaymentsPieChart';
import { QuotePreviewModal } from '../../../../components/QuotePreviewModal';
import { api } from '../../../../lib/api-client';
import type {
  QuoteBranchItem,
  QuotePaymentServiceStatus,
  QuotePaymentsDashboard,
  QuotePaymentsDashboardClient,
} from '../../../../lib/types';

function money(value: number) {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function formatDate(value: string) {
  const d = value.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return value;
  return `${day}/${m}/${y}`;
}

const SERVICE_STATUS_META: Record<
  QuotePaymentServiceStatus,
  { label: string; className: string; hint: string }
> = {
  done: {
    label: 'Servicio hecho',
    className: 'badge badge-success',
    hint: 'El trabajo ya se realizó y todavía hay saldo por cobrar.',
  },
  partial: {
    label: 'Servicio parcial',
    className: 'badge badge-warning',
    hint: 'Hay visitas hechas y otras pendientes.',
  },
  pending: {
    label: 'Servicio pendiente',
    className: 'badge badge-warning',
    hint: 'Hay servicio asociado, todavía no está completado.',
  },
  none: {
    label: 'Sin servicio',
    className: 'badge',
    hint: 'Todavía no se generó el trabajo eventual.',
  },
};

export default function QuotePaymentsDashboardPage() {
  const [data, setData] = useState<QuotePaymentsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<QuoteBranchItem[]>([]);
  const [kindFilter, setKindFilter] = useState<'all' | 'eventual' | 'particular' | 'building'>(
    'all',
  );
  const [serviceFilter, setServiceFilter] = useState<'all' | QuotePaymentServiceStatus>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'unassigned' | string>('all');
  const [page, setPage] = useState(1);
  const [previewQuoteId, setPreviewQuoteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (branchId) params.set('branchId', branchId);
      const qs = params.toString();
      const res = await api.get<QuotePaymentsDashboard>(
        `/quotes/payments-dashboard${qs ? `?${qs}` : ''}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el dashboard de pagos');
    } finally {
      setLoading(false);
    }
  }, [search, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api
      .get<QuoteBranchItem[]>('/quote-branches?includeInactive=false')
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  const clients = useMemo(() => {
    const list = data?.clients ?? [];
    return list.flatMap((client) => {
      if (kindFilter !== 'all' && client.kind !== kindFilter) return [];
      let quotes = client.quotes;
      if (serviceFilter !== 'all') {
        quotes = quotes.filter((quote) => quote.serviceStatus === serviceFilter);
      }
      if (methodFilter !== 'all') {
        quotes = quotes.filter((quote) =>
          quote.pendingByMethod.some((slice) =>
            methodFilter === 'unassigned'
              ? slice.paymentMethodId === 'unassigned'
              : slice.paymentMethodId === methodFilter,
          ),
        );
      }
      if (quotes.length === 0) return [];
      const statuses = quotes.map((quote) => quote.serviceStatus);
      const unique = new Set(statuses);
      let serviceStatus: QuotePaymentServiceStatus = statuses[0] ?? 'none';
      if (unique.size > 1) {
        serviceStatus = unique.has('done') || unique.has('partial') ? 'partial' : 'pending';
      }
      return [
        {
          ...client,
          quotes,
          quoteCount: quotes.length,
          pendingAmount: quotes.reduce((acc, quote) => acc + quote.pendingAmount, 0),
          paidAmount: quotes.reduce((acc, quote) => acc + (quote.paidAmount ?? 0), 0),
          serviceStatus,
        },
      ];
    });
  }, [data, kindFilter, serviceFilter, methodFilter]);

  const visibleAmount = useMemo(
    () => clients.reduce((acc, client) => acc + client.pendingAmount, 0),
    [clients],
  );

  const hasListFilter = methodFilter !== 'all' || serviceFilter !== 'all' || kindFilter !== 'all';

  useEffect(() => {
    setPage(1);
  }, [search, branchId, kindFilter, serviceFilter, methodFilter]);

  const PAGE_SIZE = 10;
  const pages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pagedClients = clients.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function openPreview(quoteId: string) {
    setPreviewQuoteId(quoteId);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard de Pagos</h1>
          <p className="page-subtitle">
            Pendientes de cobro de presupuestos, agrupados por cliente, con el estado del servicio y
            el desglose por medio de pago.
          </p>
        </div>
      </div>

      <QuotesSubnav />

      <form onSubmit={applyFilters} className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-field" style={{ margin: 0, flex: '1 1 220px' }}>
            <label htmlFor="pay-search">Buscar</label>
            <input
              id="pay-search"
              className="input"
              type="search"
              placeholder="N° presupuesto o cliente…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pay-branch">Sucursal</label>
            <select
              id="pay-branch"
              className="input"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Todas</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isDefault ? ' (predeterminada)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pay-kind">Tipo de cliente</label>
            <select
              id="pay-kind"
              className="input"
              value={kindFilter}
              onChange={(e) =>
                setKindFilter(e.target.value as 'all' | 'eventual' | 'particular' | 'building')
              }
            >
              <option value="all">Todos</option>
              <option value="eventual">Eventual</option>
              <option value="particular">Particular</option>
              <option value="building">Edificio</option>
            </select>
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="pay-service">Servicio</label>
            <select
              id="pay-service"
              className="input"
              value={serviceFilter}
              onChange={(e) =>
                setServiceFilter(e.target.value as 'all' | QuotePaymentServiceStatus)
              }
            >
              <option value="all">Todos</option>
              <option value="done">Hecho (falta cobrar)</option>
              <option value="partial">Parcial</option>
              <option value="pending">Pendiente</option>
              <option value="none">Sin servicio</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            Filtrar
          </button>
        </div>
      </form>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading && !data ? (
        <div className="card">
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
          </div>
        </div>
      ) : data ? (
        <>
          <section className="dashboard-kpi-section" aria-label="Indicadores de cobro">
            <div className="hierarchy-stats dashboard-kpi-grid">
              <div className="hierarchy-stat-chip">
                <span className="hierarchy-stat-value" style={{ color: 'var(--color-error)' }}>
                  {money(data.totals.pendingAmount)}
                </span>
                <span className="hierarchy-stat-label">Total a cobrar</span>
              </div>
              <div className="hierarchy-stat-chip">
                <span className="hierarchy-stat-value">{data.totals.pendingClients}</span>
                <span className="hierarchy-stat-label">Clientes con deuda</span>
              </div>
              <div className="hierarchy-stat-chip">
                <span className="hierarchy-stat-value">{data.totals.pendingQuotes}</span>
                <span className="hierarchy-stat-label">Presupuestos pendientes</span>
              </div>
              <div className="hierarchy-stat-chip payments-dash-kpi--done">
                <span className="hierarchy-stat-value" style={{ color: 'var(--color-success)' }}>
                  {money(data.totals.doneServicesAmount)}
                </span>
                <span className="hierarchy-stat-label">Servicio hecho, sin cobrar</span>
              </div>
            </div>
          </section>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 className="card-title" style={{ marginTop: 0 }}>
              Estadísticas por medio de pago
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Tocá un medio para filtrar los pendientes. Volvé a tocar para ver todos.
            </p>
            <QuotePaymentsPieChart
              items={data.byPaymentMethod}
              selectedId={methodFilter}
              onSelect={setMethodFilter}
            />
          </div>

          <div className="card">
            <div className="payments-dash-list-header">
              <h2 className="card-title" style={{ margin: 0 }}>
                Pendientes de cobro
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
                {hasListFilter ? ` · ${money(visibleAmount)} en este filtro` : ''}
              </p>
            </div>
            <p className="payments-dash-legend-row">
              <span className="payments-dash-swatch payments-dash-swatch--done" /> Servicio hecho
              <span className="payments-dash-swatch payments-dash-swatch--partial" /> Parcial
              <span className="payments-dash-swatch payments-dash-swatch--pending" /> Pendiente
              <span className="payments-dash-swatch payments-dash-swatch--none" /> Sin servicio
            </p>

            {clients.length === 0 ? (
              <p className="empty-state">No hay pendientes de cobro para este filtro.</p>
            ) : (
              <>
                <ul className="payments-dash-clients">
                  {pagedClients.map((client) => (
                    <ClientDebtCard
                      key={client.key}
                      client={client}
                      onOpenQuote={openPreview}
                    />
                  ))}
                </ul>
                {pages > 1 ? (
                  <div className="payments-dash-pager">
                    <span className="muted">
                      Página {safePage} de {pages} · {clients.length}{' '}
                      {clients.length === 1 ? 'cliente' : 'clientes'}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={safePage >= pages}
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ marginTop: 16 }}>
                    {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
                  </p>
                )}
              </>
            )}
          </div>
        </>
      ) : null}

      {previewQuoteId ? (
        <QuotePreviewModal quoteId={previewQuoteId} onClose={() => setPreviewQuoteId(null)} />
      ) : null}
    </>
  );
}

function ClientDebtCard({
  client,
  onOpenQuote,
}: {
  client: QuotePaymentsDashboardClient;
  onOpenQuote: (quoteId: string) => void;
}) {
  const meta = SERVICE_STATUS_META[client.serviceStatus];
  const showBreakdown = client.quoteCount > 1;
  const singleQuoteId = client.quoteCount === 1 ? client.quotes[0]?.id ?? null : null;
  const methods = [
    ...new Set(client.quotes.flatMap((quote) => quote.pendingByMethod.map((slice) => slice.name))),
  ];

  return (
    <li className={`payments-dash-client payments-dash-client--${client.serviceStatus}`}>
      <div className="payments-dash-client-main">
        <div className="payments-dash-client-info">
          {singleQuoteId ? (
            <button
              type="button"
              className="payments-dash-client-name"
              onClick={() => onOpenQuote(singleQuoteId)}
            >
              {client.name}
            </button>
          ) : (
            <span className="payments-dash-client-name">{client.name}</span>
          )}
          <div className="payments-dash-client-meta">
            <span className="badge">{client.kindLabel}</span>
            <span className={meta.className} title={meta.hint}>
              {meta.label}
            </span>
            {client.quoteCount > 1 ? (
              <span className="muted">{client.quoteCount} presupuestos</span>
            ) : null}
            {methods.length > 0 ? <span className="muted">{methods.join(' · ')}</span> : null}
          </div>
        </div>
        <div className="payments-dash-client-amount">
          <span className="payments-dash-amount">{money(client.pendingAmount)}</span>
          <span className="muted">{showBreakdown ? 'deuda total' : 'deuda'}</span>
          <PaidHint
            paidAmount={client.paidAmount}
            quotes={client.quotes}
          />
          {singleQuoteId ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onOpenQuote(singleQuoteId)}
            >
              Ver presupuesto
            </button>
          ) : null}
        </div>
      </div>

      {showBreakdown ? (
        <ul className="payments-dash-quotes">
          {client.quotes.map((quote) => {
            const quoteMeta = SERVICE_STATUS_META[quote.serviceStatus];
            return (
              <li
                key={quote.id}
                className={`payments-dash-quote payments-dash-quote--${quote.serviceStatus}`}
              >
                <div>
                  <button
                    type="button"
                    className="payments-dash-quote-link"
                    onClick={() => onOpenQuote(quote.id)}
                  >
                    Presupuesto {formatQuoteNumber(quote.number)}
                  </button>
                  <div className="payments-dash-client-meta">
                    <span className="muted">{formatDate(String(quote.requestDate))}</span>
                    <span className="badge">
                      {QUOTE_STATUS_LABELS[quote.status as SharedQuoteStatus] ?? quote.status}
                    </span>
                    <span className={quoteMeta.className} title={quoteMeta.hint}>
                      {quoteMeta.label}
                    </span>
                    {quote.branchName ? <span className="muted">{quote.branchName}</span> : null}
                  </div>
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                    Total {money(quote.total)} · Abonado {quote.paidPercent}% · Pendiente{' '}
                    {quote.pendingPercent}%
                    {quote.pendingByMethod.length > 0
                      ? ` · ${quote.pendingByMethod.map((slice) => slice.name).join(', ')}`
                      : ''}
                  </p>
                </div>
                <div className="payments-dash-quote-side">
                  <span className="payments-dash-amount">{money(quote.pendingAmount)}</span>
                  <span className="muted">deuda</span>
                  <PaidHint paidAmount={quote.paidAmount} quotes={[quote]} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onOpenQuote(quote.id)}
                  >
                    Vista previa
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function PaidHint({
  paidAmount,
  quotes,
}: {
  paidAmount: number;
  quotes: QuotePaymentsDashboardClient['quotes'];
}) {
  if (!paidAmount || paidAmount < 0.01) return null;
  const totals = quotes.reduce((acc, quote) => acc + quote.total, 0);
  const percent = totals > 0 ? Math.round((paidAmount / totals) * 1000) / 10 : 0;
  const methods = [
    ...new Set(
      quotes.flatMap((quote) => (quote.paidByMethod ?? []).map((slice) => slice.name)),
    ),
  ];
  return (
    <span className="payments-dash-paid">
      Abonado {money(paidAmount)}
      {percent > 0 ? ` (${percent}%)` : ''}
      {methods.length > 0 ? ` · ${methods.join(', ')}` : ''}
    </span>
  );
}
