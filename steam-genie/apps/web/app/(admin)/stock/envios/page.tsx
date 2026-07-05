'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  STOCK_SHIPMENT_DESTINATION_STATUS_LABELS,
  STOCK_SHIPMENT_ORDER_STATUS_LABELS,
  STOCK_UNIT_LABELS,
  calendarDateKeyFromStored,
  formatStoredCalendarDate,
} from '@steam-genie/shared-constants';
import { StockSubnav } from '../../../../components/StockSubnav';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import {
  allocationSummary,
  canAddProductLine,
  depotAvailable,
  emptyDestination,
  maxQtyForLine,
  productDepotLabel,
  productUnitLabel,
  selectableProductsForLine,
  validateShipmentDraft,
  type DraftDestination,
  type DraftLine,
} from '../../../../lib/shipment-draft';
import type {
  ShipmentDestinationItem,
  ShipmentOrderItem,
  StockProductGroup,
} from '../../../../lib/types';

function openCreateModal(
  setShowCreate: (v: boolean) => void,
  setDestinations: (v: DraftDestination[]) => void,
  setNotes: (v: string) => void,
  setCreateError: (v: string | null) => void,
  reloadProducts: () => void,
) {
  setNotes('');
  setDestinations([emptyDestination()]);
  setCreateError(null);
  reloadProducts();
  setShowCreate(true);
}

function orderStatusBadge(status: ShipmentOrderItem['status']) {
  if (status === 'DRAFT') return 'badge';
  if (status === 'DISPATCHED') return 'badge badge-info';
  if (status === 'DELIVERED') return 'badge badge-success';
  return 'badge badge-error';
}

function destStatusBadge(status: ShipmentDestinationItem['status']) {
  if (status === 'PENDING') return 'badge badge-info';
  if (status === 'DELIVERED') return 'badge badge-success';
  return 'badge badge-error';
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StockShipmentsPage() {
  const [orders, setOrders] = useState<ShipmentOrderItem[]>([]);
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [productGroups, setProductGroups] = useState<StockProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selected, setSelected] = useState<ShipmentOrderItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notes, setNotes] = useState('');
  const [destinations, setDestinations] = useState<DraftDestination[]>([emptyDestination()]);
  const [dispatchDates, setDispatchDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const products = useMemo(
    () => productGroups.flatMap((g) => g.products).filter((p) => p.isActive),
    [productGroups],
  );

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const allocations = useMemo(
    () => allocationSummary(destinations, productsById),
    [destinations, productsById],
  );

  const draftInvalid = useMemo(
    () => validateShipmentDraft(destinations, productsById),
    [destinations, productsById],
  );

  const reloadProducts = useCallback(() => {
    void api
      .get<{ groups: StockProductGroup[] }>('/stock/products/grouped?includeInactive=false')
      .then((res) => setProductGroups(res.groups));
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ShipmentOrderItem[]>('/stock-logistics/shipments');
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      loadOrders(),
      fetchBuildingsList().then(setBuildings),
      api
        .get<{ groups: StockProductGroup[] }>('/stock/products/grouped?includeInactive=false')
        .then((res) => setProductGroups(res.groups)),
    ]);
  }, [loadOrders]);

  function openOrder(order: ShipmentOrderItem) {
    setSelected(order);
    setDispatchError(null);
    const dates: Record<string, string> = {};
    for (const dest of order.destinations) {
      if (dest.deliveryDate) {
        dates[dest.id] = calendarDateKeyFromStored(dest.deliveryDate);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dates[dest.id] = tomorrow.toISOString().slice(0, 10);
      }
    }
    setDispatchDates(dates);
  }

  async function refreshSelected(orderId: string) {
    const fresh = await api.get<ShipmentOrderItem>(`/stock-logistics/shipments/${orderId}`);
    setSelected(fresh);
    setOrders((prev) => prev.map((o) => (o.id === fresh.id ? fresh : o)));
    openOrder(fresh);
  }

  async function createOrder() {
    const validationError = validateShipmentDraft(destinations, productsById);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    setCreateError(null);
    try {
      const payload = {
        notes: notes.trim() || undefined,
        destinations: destinations
          .filter((d) => d.buildingId)
          .map((d) => ({
            buildingId: d.buildingId,
            lines: d.lines
              .filter((l) => l.productId && Number(l.quantity) > 0)
              .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
          }))
          .filter((d) => d.lines.length > 0),
      };
      if (payload.destinations.length === 0) {
        throw new Error('Agregá al menos un edificio con productos.');
      }
      const created = await api.post<ShipmentOrderItem>('/stock-logistics/shipments', payload);
      setShowCreate(false);
      setNotes('');
      setDestinations([emptyDestination()]);
      setCreateError(null);
      setSuccess(`Orden ${created.reference} creada en borrador.`);
      await loadOrders();
      openOrder(created);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear orden';
      setCreateError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function dispatchOrder() {
    if (!selected) return;

    const missingDate = selected.destinations.some((d) => !dispatchDates[d.id]?.trim());
    if (missingDate) {
      setDispatchError('Asigná una fecha de entrega a cada edificio destino.');
      return;
    }

    setBusy(true);
    setError(null);
    setDispatchError(null);
    try {
      await reloadProducts();
      const body = {
        destinations: selected.destinations.map((d) => ({
          destinationId: d.id,
          deliveryDate: dispatchDates[d.id],
        })),
      };
      await api.post(`/stock-logistics/shipments/${selected.id}/dispatch`, body);
      setSuccess('Orden despachada. Stock reservado en depósito.');
      await refreshSelected(selected.id);
      await loadOrders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al despachar';
      setDispatchError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function deliverDestination(dest: ShipmentDestinationItem) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/stock-logistics/shipments/destinations/${dest.id}/deliver`, {});
      setSuccess(`Entrega confirmada en ${dest.building.name}.`);
      await refreshSelected(selected.id);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar entrega');
    } finally {
      setBusy(false);
    }
  }

  async function cancelDestination(dest: ShipmentDestinationItem) {
    if (!selected) return;
    if (!window.confirm(`¿Cancelar el envío a ${dest.building.name}? Se liberará la reserva en depósito.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/stock-logistics/shipments/destinations/${dest.id}/cancel`, {});
      setSuccess(`Destino ${dest.building.name} cancelado.`);
      await refreshSelected(selected.id);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar');
    } finally {
      setBusy(false);
    }
  }

  function updateDestination(index: number, patch: Partial<DraftDestination>) {
    setDestinations((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }

  function updateLine(destIndex: number, lineIndex: number, patch: Partial<DraftLine>) {
    setDestinations((prev) =>
      prev.map((d, i) => {
        if (i !== destIndex) return d;
        return {
          ...d,
          lines: d.lines.map((l, li) => (li === lineIndex ? { ...l, ...patch } : l)),
        };
      }),
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes de envío</h1>
          <p className="page-subtitle">
            Borrador → despacho con fecha de entrega → confirmación en edificio.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            openCreateModal(setShowCreate, setDestinations, setNotes, setCreateError, reloadProducts)
          }
        >
          Nueva orden
        </button>
      </div>

      <StockSubnav />

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      {loading ? (
        <div className="card loading-state">
          <div className="spinner" role="status" aria-label="Cargando" />
          <p className="text-muted">Cargando órdenes...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="card empty-state">
          <p>No hay órdenes de envío. Creá la primera con el botón superior.</p>
        </div>
      ) : (
        <div className="card logistics-table-card">
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Estado</th>
                <th>Destinos</th>
                <th>Despachada</th>
                <th>Creada</th>
                <th aria-hidden style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="shipment-table-row"
                  onClick={() => openOrder(order)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openOrder(order);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Abrir orden ${order.reference}`}
                >
                  <td>
                    <span className="shipment-ref">{order.reference}</span>
                    <span className="shipment-ref-sub">
                      {order.destinations.map((d) => d.building.name).join(' · ')}
                    </span>
                  </td>
                  <td>
                    <span className={orderStatusBadge(order.status)}>
                      {STOCK_SHIPMENT_ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td>{order.destinations.length}</td>
                  <td>{formatDateTime(order.dispatchedAt)}</td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>
                    <span className="shipment-open-hint" aria-hidden>
                      →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showCreate ? (
        <div className="modal-overlay" role="presentation" onClick={() => setShowCreate(false)}>
          <div
            className="modal modal-wide"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Nueva orden de envío</h2>
            </div>

            <div className="form-field">
              <label htmlFor="shipment-notes">Notas (opcional)</label>
              <textarea
                id="shipment-notes"
                className="input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones para logística..."
              />
            </div>

            {createError ? <div className="alert alert-error">{createError}</div> : null}

            {destinations.map((dest, di) => {
              const lineOptions = (li: number) =>
                selectableProductsForLine(products, dest.lines, li);
              const canAddLine = canAddProductLine(dest.lines, products);

              return (
              <div key={di} className="logistics-dest-block">
                <p className="logistics-dest-index">Destino {di + 1}</p>
                <div className="form-field">
                  <label htmlFor={`dest-building-${di}`}>Edificio</label>
                  <select
                    id={`dest-building-${di}`}
                    className="select"
                    value={dest.buildingId}
                    onChange={(e) => updateDestination(di, { buildingId: e.target.value })}
                  >
                    <option value="">Seleccionar edificio...</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {dest.lines.map((line, li) => {
                  const options = lineOptions(li);
                  const selectedProduct = line.productId
                    ? productsById.get(line.productId)
                    : undefined;
                  const maxQty = maxQtyForLine(destinations, di, li, productsById);
                  const qtyNum = Number(line.quantity);
                  const qtyOver = maxQty != null && !Number.isNaN(qtyNum) && qtyNum > maxQty;

                  return (
                  <div key={li} className="logistics-line-grid">
                    <div className="form-field">
                      <label htmlFor={`dest-${di}-product-${li}`}>Producto</label>
                      <select
                        id={`dest-${di}-product-${li}`}
                        className="select"
                        value={line.productId}
                        onChange={(e) => {
                          updateLine(di, li, { productId: e.target.value });
                          setCreateError(null);
                        }}
                      >
                        <option value="">Seleccionar...</option>
                        {options.map((p) => (
                          <option key={p.id} value={p.id}>
                            {productDepotLabel(p)}
                          </option>
                        ))}
                      </select>
                      {selectedProduct ? (
                        <span className="logistics-stock-hint">
                          Depósito disponible:{' '}
                          <strong>
                            {depotAvailable(selectedProduct)} {productUnitLabel(selectedProduct)}
                          </strong>
                          {maxQty != null && maxQty < depotAvailable(selectedProduct) ? (
                            <> · máx. en esta línea: <strong>{maxQty}</strong></>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    <div className="form-field">
                      <label htmlFor={`dest-${di}-qty-${li}`}>Cant.</label>
                      <input
                        id={`dest-${di}-qty-${li}`}
                        type="number"
                        className={`input${qtyOver ? ' input--error' : ''}`}
                        min={0.001}
                        max={maxQty ?? undefined}
                        step="any"
                        value={line.quantity}
                        onChange={(e) => {
                          updateLine(di, li, { quantity: e.target.value });
                          setCreateError(null);
                        }}
                      />
                      {qtyOver ? (
                        <span className="logistics-stock-hint logistics-stock-hint--error">
                          Supera el disponible ({maxQty} máx. en esta línea)
                        </span>
                      ) : null}
                    </div>
                    {dest.lines.length > 1 ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          updateDestination(di, {
                            lines: dest.lines.filter((_, idx) => idx !== li),
                          })
                        }
                      >
                        Quitar
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                  );
                })}

                <div className="logistics-add-row">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!canAddLine}
                    title={
                      canAddLine
                        ? undefined
                        : 'Ya agregaste todos los productos en este edificio'
                    }
                    onClick={() =>
                      updateDestination(di, {
                        lines: [...dest.lines, { productId: '', quantity: '1' }],
                      })
                    }
                  >
                    + Producto
                  </button>
                </div>
              </div>
              );
            })}

            {allocations.length > 0 ? (
              <div className="logistics-allocation-panel">
                <p className="logistics-allocation-title">Resumen por producto (toda la orden)</p>
                <ul className="logistics-allocation-list">
                  {allocations.map((row) => (
                    <li
                      key={row.productId}
                      className={row.over ? 'logistics-allocation-item--over' : undefined}
                    >
                      <span>{row.name}</span>
                      <span>
                        {row.allocated} / {row.depot} {row.unit}
                        {row.over
                          ? ' — excede depósito'
                          : row.remaining > 0
                            ? ` (${row.remaining} libre)`
                            : ' (sin stock libre)'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {draftInvalid && allocations.length > 0 ? (
              <p className="logistics-stock-hint logistics-stock-hint--error">{draftInvalid}</p>
            ) : null}

            <div className="logistics-add-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDestinations((prev) => [...prev, emptyDestination()])}
              >
                + Otro edificio
              </button>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || Boolean(draftInvalid)}
                onClick={() => void createOrder()}
              >
                {busy ? 'Creando...' : 'Crear borrador'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="modal-overlay" role="presentation" onClick={() => setSelected(null)}>
          <div
            className="modal modal-wide"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Orden {selected.reference}</h2>
            </div>

            <div className="logistics-detail-meta">
              <span className={orderStatusBadge(selected.status)}>
                {STOCK_SHIPMENT_ORDER_STATUS_LABELS[selected.status]}
              </span>
              {selected.dispatchedAt ? (
                <span className="text-muted text-sm">
                  Despachada {formatDateTime(selected.dispatchedAt)}
                </span>
              ) : null}
            </div>

            {selected.notes ? (
              <p className="logistics-hint">{selected.notes}</p>
            ) : null}

            {dispatchError ? <div className="alert alert-error">{dispatchError}</div> : null}

            {selected.destinations.map((dest) => (
              <div key={dest.id} className="logistics-dest-block">
                <div className="logistics-dest-header">
                  <h3 className="logistics-dest-title">{dest.building.name}</h3>
                  <span className={destStatusBadge(dest.status)}>
                    {STOCK_SHIPMENT_DESTINATION_STATUS_LABELS[dest.status]}
                  </span>
                </div>

                <ul className="logistics-product-list">
                  {dest.lines.map((line) => (
                    <li key={line.id}>
                      <span>{line.product.name}</span>
                      <span>
                        {line.quantity}{' '}
                        {STOCK_UNIT_LABELS[line.product.unitType as keyof typeof STOCK_UNIT_LABELS] ??
                          line.product.unitType}
                      </span>
                    </li>
                  ))}
                </ul>

                {selected.status === 'DRAFT' ? (
                  <p className="logistics-hint">
                    Al despachar se reservará stock en depósito y se asignará fecha de entrega.
                  </p>
                ) : null}

                {selected.status === 'DRAFT' ||
                (selected.status === 'DISPATCHED' && dest.status === 'PENDING') ? (
                  <div className="form-field">
                    <label htmlFor={`delivery-${dest.id}`}>Fecha de entrega</label>
                    <input
                      id={`delivery-${dest.id}`}
                      type="date"
                      className="input"
                      value={dispatchDates[dest.id] ?? ''}
                      onChange={(e) => {
                        setDispatchDates((prev) => ({ ...prev, [dest.id]: e.target.value }));
                        setDispatchError(null);
                      }}
                      disabled={selected.status !== 'DRAFT' && dest.status !== 'PENDING'}
                    />
                  </div>
                ) : (
                  <p className="logistics-hint">
                    Entrega prevista:{' '}
                    <strong>
                      {formatStoredCalendarDate(dest.deliveryDate, 'es-AR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </strong>
                  </p>
                )}

                {selected.status === 'DISPATCHED' && dest.status === 'PENDING' ? (
                  <div className="modal-actions modal-actions--inline">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => void deliverDestination(dest)}
                    >
                      Confirmar entrega
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void cancelDestination(dest)}
                    >
                      Cancelar destino
                    </button>
                  </div>
                ) : null}

                {dest.deliveredAt ? (
                  <p className="logistics-hint">
                    Entregado: <strong>{formatDateTime(dest.deliveredAt)}</strong>
                  </p>
                ) : null}
              </div>
            ))}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
                Cerrar
              </button>
              {selected.status === 'DRAFT' ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void dispatchOrder()}
                >
                  {busy ? 'Despachando...' : 'Despachar orden'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
