'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  STOCK_MOVEMENT_SCOPE_LABELS,
  STOCK_MOVEMENT_TYPE_LABELS,
} from '@steam-genie/shared-constants';
import { api } from '../lib/api-client';
import type { StockMovementRow } from '../lib/types';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

type StockMovementHistoryModalProps = {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  buildingId?: string;
  buildingName?: string;
};

export function StockMovementHistoryModal({
  open,
  onClose,
  productId,
  productName,
  buildingId,
  buildingName,
}: StockMovementHistoryModalProps) {
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ productId });
      if (buildingId) params.set('buildingId', buildingId);
      params.set('limit', '100');
      const data = await api.get<StockMovementRow[]>(`/stock-logistics/movements?${params}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [buildingId, productId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal-lg stock-movements-modal"
        role="dialog"
        aria-labelledby="stock-movements-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="stock-movements-title" className="modal-title">
          Historial de movimientos
        </h2>
        <p className="text-muted" style={{ marginTop: 0 }}>
          <strong>{productName}</strong>
          {buildingName ? (
            <>
              {' '}
              · <span>{buildingName}</span>
            </>
          ) : (
            ' · Depósito central'
          )}
        </p>

        {error ? <div className="alert alert-error">{error}</div> : null}

        {loading ? (
          <div className="loading-state" style={{ padding: 24 }}>
            <div className="spinner" role="status" aria-label="Cargando historial" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted">Todavía no hay movimientos registrados para este producto.</p>
        ) : (
          <div className="stock-movements-list">
            {rows.map((row) => {
              const actor =
                row.performedBy?.fullName ??
                row.shipmentDestination?.confirmedBy?.fullName ??
                '—';
              const hasReserveChange =
                row.reservedDelta != null && row.reservedDelta !== 0;
              return (
                <article key={row.id} className="stock-movement-item">
                  <div className="stock-movement-item-header">
                    <strong>{STOCK_MOVEMENT_TYPE_LABELS[row.movementType]}</strong>
                    <span className="text-muted text-sm">{formatDateTime(row.occurredAt)}</span>
                  </div>
                  <div className="stock-movement-item-meta">
                    <span>{STOCK_MOVEMENT_SCOPE_LABELS[row.scope]}</span>
                    {row.building?.name ? <span> · {row.building.name}</span> : null}
                    {row.shipmentOrder?.reference ? (
                      <span> · Orden {row.shipmentOrder.reference}</span>
                    ) : null}
                  </div>
                  <div className="stock-movement-item-qty">
                    Stock: {row.quantityBefore} → {row.quantityAfter}
                    {row.quantityDelta !== 0 ? (
                      <span className="stock-movement-delta"> ({formatDelta(row.quantityDelta)})</span>
                    ) : null}
                  </div>
                  {hasReserveChange ? (
                    <div className="stock-movement-item-qty text-muted text-sm">
                      Reservado: {row.reservedBefore ?? 0} → {row.reservedAfter ?? 0}
                      {row.reservedDelta != null ? (
                        <span className="stock-movement-delta">
                          {' '}
                          ({formatDelta(row.reservedDelta)})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="stock-movement-item-actor text-sm">
                    {row.movementType === 'BUILDING_RECEIVE' &&
                    row.shipmentDestination?.confirmedBy ? (
                      <>
                        Confirmado por{' '}
                        <strong>{row.shipmentDestination.confirmedBy.fullName}</strong>
                        {row.shipmentDestination.deliveredAt ? (
                          <span className="text-muted">
                            {' '}
                            · {formatDateTime(row.shipmentDestination.deliveredAt)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        Realizado por <strong>{actor}</strong>
                      </>
                    )}
                  </div>
                  {row.note ? (
                    <p className="stock-movement-item-note text-muted text-sm">{row.note}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
