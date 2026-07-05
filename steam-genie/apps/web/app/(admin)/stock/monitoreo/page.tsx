'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUILDING_STOCK_ALERT_STATUS_LABELS,
  BUILDING_STOCK_ALERT_TYPE_LABELS,
  STOCK_UNIT_LABELS,
  formatStoredCalendarDate,
} from '@steam-genie/shared-constants';
import { StockSubnav } from '../../../../components/StockSubnav';
import { StockAlertPhoto } from '../../../../components/StockAlertPhoto';
import { StockMovementHistoryModal } from '../../../../components/StockMovementHistoryModal';
import { api } from '../../../../lib/api-client';
import { fetchBuildingsList } from '../../../../lib/buildings-cache';
import type {
  BuildingStockAlertRow,
  StockCategoryItem,
  StockMonitoringMatrix,
  StockStats,
} from '../../../../lib/types';

function alertChipClass(status: 'OPEN' | 'IN_TRANSIT' | 'RESOLVED' | undefined) {
  if (status === 'IN_TRANSIT') return 'stock-alert-chip stock-alert-chip--transit';
  if (status === 'OPEN') return 'stock-alert-chip stock-alert-chip--open';
  return '';
}

function formatDeliveryDate(iso: string | null | undefined) {
  if (!iso) return null;
  return formatStoredCalendarDate(iso, 'es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StockMonitoringPage() {
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<StockCategoryItem[]>([]);
  const [alerts, setAlerts] = useState<BuildingStockAlertRow[]>([]);
  const [depotStats, setDepotStats] = useState<StockStats | null>(null);
  const [buildingMatrix, setBuildingMatrix] = useState<StockMonitoringMatrix | null>(null);

  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingBuilding, setLoadingBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [buildingSearch, setBuildingSearch] = useState('');
  const [buildingSearchFocused, setBuildingSearchFocused] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedBuildingName, setSelectedBuildingName] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [editCell, setEditCell] = useState<{
    buildingId: string;
    buildingName: string;
    productId: string;
    productName: string;
    quantity: number;
  } | null>(null);
  const [editQty, setEditQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{
    productId: string;
    productName: string;
    buildingId: string;
    buildingName: string;
  } | null>(null);

  const loadAlertsAndStats = useCallback(async () => {
    setLoadingAlerts(true);
    setError(null);
    try {
      const [alertsData, statsData] = await Promise.all([
        api.get<BuildingStockAlertRow[]>('/stock-logistics/alerts'),
        api.get<StockStats>('/stock/stats'),
      ]);
      setAlerts(alertsData);
      setDepotStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar alertas');
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  const loadBuildingStock = useCallback(async () => {
    if (!selectedBuildingId) {
      setBuildingMatrix(null);
      return;
    }
    setLoadingBuilding(true);
    setError(null);
    try {
      const params = new URLSearchParams({ buildingId: selectedBuildingId });
      if (debouncedProductSearch.trim()) params.set('search', debouncedProductSearch.trim());
      if (categoryFilter) params.set('categoryId', categoryFilter);
      const data = await api.get<StockMonitoringMatrix>(
        `/stock-logistics/monitoring?${params.toString()}`,
      );
      setBuildingMatrix(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar stock del edificio');
      setBuildingMatrix(null);
    } finally {
      setLoadingBuilding(false);
    }
  }, [categoryFilter, debouncedProductSearch, selectedBuildingId]);

  useEffect(() => {
    void Promise.all([
      fetchBuildingsList().then(setBuildings),
      api.get<StockCategoryItem[]>('/stock/categories').then(setCategories),
      loadAlertsAndStats(),
    ]);
  }, [loadAlertsAndStats]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedProductSearch(productSearch), 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadBuildingStock();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadBuildingStock]);

  const buildingSuggestions = useMemo(() => {
    const q = buildingSearch.trim().toLowerCase();
    if (!q) return [];
    return buildings.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 12);
  }, [buildingSearch, buildings]);

  const showBuildingSuggestions =
    buildingSearchFocused && !selectedBuildingId && buildingSearch.trim().length > 0;

  const alertStats = useMemo(
    () => ({
      open: alerts.filter((a) => a.status === 'OPEN').length,
      inTransit: alerts.filter((a) => a.status === 'IN_TRANSIT').length,
    }),
    [alerts],
  );

  const cellMap = useMemo(() => {
    const map = new Map<string, StockMonitoringMatrix['cells'][number]>();
    for (const cell of buildingMatrix?.cells ?? []) {
      map.set(cell.productId, cell);
    }
    return map;
  }, [buildingMatrix?.cells]);

  function selectBuilding(id: string, name: string) {
    setSelectedBuildingId(id);
    setSelectedBuildingName(name);
    setBuildingSearch(name);
    setBuildingSearchFocused(false);
  }

  function clearBuilding() {
    setSelectedBuildingId('');
    setSelectedBuildingName('');
    setBuildingSearch('');
    setBuildingSearchFocused(false);
    setBuildingMatrix(null);
    setProductSearch('');
    setCategoryFilter('');
  }

  function focusBuildingFromAlert(alert: BuildingStockAlertRow) {
    selectBuilding(alert.building.id, alert.building.name);
    document.getElementById('monitoring-building-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveQuantity() {
    if (!editCell) return;
    const qty = Number(editQty);
    if (Number.isNaN(qty) || qty < 0) {
      setError('Ingresá una cantidad válida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/stock-logistics/buildings/${editCell.buildingId}/items`, {
        productId: editCell.productId,
        quantity: qty,
      });
      setSuccess(`Stock actualizado en ${editCell.buildingName}.`);
      setEditCell(null);
      await Promise.all([loadAlertsAndStats(), loadBuildingStock()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Monitoreo de stock</h1>
          <p className="page-subtitle">
            Alertas activas de edificios y consulta de stock por edificio.
          </p>
        </div>
      </div>

      <StockSubnav />

      <div className="hierarchy-stats" style={{ marginBottom: 20 }}>
        <div className="hierarchy-stat-chip">
          <span className="hierarchy-stat-value">{depotStats?.lowStock ?? '—'}</span>
          <span className="hierarchy-stat-label">Depósito bajo stock</span>
        </div>
        <div className="hierarchy-stat-chip">
          <span
            className="hierarchy-stat-value"
            style={{ color: 'var(--color-error)' }}
          >
            {depotStats?.outOfStock ?? '—'}
          </span>
          <span className="hierarchy-stat-label">Depósito sin stock</span>
        </div>
        <div className="hierarchy-stat-chip">
          <span className="hierarchy-stat-value">{alertStats.open}</span>
          <span className="hierarchy-stat-label">Alertas pendientes</span>
        </div>
        <div className="hierarchy-stat-chip">
          <span className="hierarchy-stat-value">{alertStats.inTransit}</span>
          <span className="hierarchy-stat-label">En camino</span>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? (
        <div className="alert alert-success" onAnimationEnd={() => setSuccess(null)}>
          {success}
        </div>
      ) : null}

      <div className="monitoring-layout">
        <section className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 className="monitoring-section-title" style={{ margin: 0 }}>
              Alertas y entregas
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingAlerts}
              onClick={() => void loadAlertsAndStats()}
            >
              Actualizar
            </button>
          </div>

          {loadingAlerts ? (
            <div className="loading-state" style={{ padding: 24 }}>
              <div className="spinner" role="status" aria-label="Cargando alertas" />
            </div>
          ) : alerts.length === 0 ? (
            <p className="text-muted">No hay alertas activas ni entregas en camino.</p>
          ) : (
            <ul className="monitoring-alert-list">
              {alerts.map((alert) => {
                const delivery =
                  alert.deliveryDate ??
                  alert.shipmentDestination?.deliveryDate ??
                  null;
                const orderRef = alert.shipmentDestination?.order.reference;
                return (
                  <li key={alert.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={`monitoring-alert-card monitoring-alert-card--${
                        alert.status === 'IN_TRANSIT' ? 'transit' : 'open'
                      }`}
                      onClick={() => focusBuildingFromAlert(alert)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          focusBuildingFromAlert(alert);
                        }
                      }}
                    >
                      <div className="monitoring-alert-card-header">
                        <span className="monitoring-alert-card-building">
                          {alert.building.name}
                        </span>
                        <span className={alertChipClass(alert.status)}>
                          {BUILDING_STOCK_ALERT_STATUS_LABELS[alert.status]}
                        </span>
                      </div>
                      <span className="monitoring-alert-card-product">
                        {alert.product.name}
                        {alert.product.sku ? ` · ${alert.product.sku}` : ''}
                      </span>
                      <span className="monitoring-alert-card-meta">
                        {BUILDING_STOCK_ALERT_TYPE_LABELS[alert.alertType]}
                        {alert.status === 'IN_TRANSIT' && delivery
                          ? ` · Entrega ${formatDeliveryDate(delivery)}`
                          : ''}
                        {orderRef ? ` · Orden ${orderRef}` : ''}
                      </span>
                      {alert.note ? (
                        <span className="monitoring-alert-card-meta">{alert.note}</span>
                      ) : null}
                      {alert.photoUrl ? (
                        <StockAlertPhoto photoUrl={alert.photoUrl} />
                      ) : null}
                      <span className="monitoring-alert-card-meta">
                        Reportada por {alert.reportedBy.fullName} ·{' '}
                        {formatDateTime(alert.createdAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="monitoring-building-section" className="card" style={{ padding: '20px' }}>
          <h2 className="monitoring-section-title">Stock por edificio</h2>
          <p className="text-muted text-sm" style={{ marginTop: 0, marginBottom: 16 }}>
            Buscá un edificio para ver todos sus productos habilitados y ajustar cantidades.
          </p>

          <div className="form-field monitoring-building-search worker-search-field">
            <label htmlFor="building-search">Buscar edificio</label>
            <input
              id="building-search"
              type="search"
              className="input"
              placeholder="Nombre del edificio..."
              value={buildingSearch}
              onChange={(e) => {
                setBuildingSearch(e.target.value);
                if (selectedBuildingId && e.target.value !== selectedBuildingName) {
                  setSelectedBuildingId('');
                  setSelectedBuildingName('');
                }
              }}
              onFocus={() => setBuildingSearchFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setBuildingSearchFocused(false), 150);
              }}
              autoComplete="off"
            />
            {selectedBuildingId ? (
              <div className="monitoring-building-selected">
                <strong>{selectedBuildingName}</strong>
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearBuilding}>
                  Cambiar
                </button>
              </div>
            ) : showBuildingSuggestions && buildingSuggestions.length > 0 ? (
              <ul className="worker-search-suggestions" role="listbox" aria-label="Edificios">
                {buildingSuggestions.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      role="option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectBuilding(b.id, b.name)}
                    >
                      {b.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : showBuildingSuggestions ? (
              <span className="muted worker-search-hint">Sin edificios coincidentes</span>
            ) : null}
          </div>

          {selectedBuildingId ? (
            <>
              <div className="logistics-filters" style={{ marginTop: 16, marginBottom: 16 }}>
                <div className="form-field" style={{ flex: '2 1 200px' }}>
                  <label htmlFor="product-search">Filtrar productos</label>
                  <input
                    id="product-search"
                    type="search"
                    className="input"
                    placeholder="Nombre o SKU..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="category-filter">Categoría</label>
                  <select
                    id="category-filter"
                    className="select"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingBuilding ? (
                <div className="loading-state" style={{ padding: 24 }}>
                  <div className="spinner" role="status" aria-label="Cargando stock" />
                </div>
              ) : !buildingMatrix || buildingMatrix.products.length === 0 ? (
                <p className="text-muted">
                  Este edificio no tiene productos habilitados con los filtros actuales.
                </p>
              ) : (
                <div className="logistics-table-card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Categoría</th>
                          <th>Stock</th>
                          <th>Alerta</th>
                          <th style={{ width: 100 }}>Historial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buildingMatrix.products.map((product) => {
                          const cell = cellMap.get(product.id);
                          const alert = cell?.alert;
                          const unitLabel =
                            STOCK_UNIT_LABELS[
                              product.unitType as keyof typeof STOCK_UNIT_LABELS
                            ] ?? product.unitType;
                          return (
                            <tr key={product.id}>
                              <td>
                                <strong>{product.name}</strong>
                                {product.sku ? (
                                  <span className="text-muted text-sm" style={{ display: 'block' }}>
                                    {product.sku}
                                  </span>
                                ) : null}
                              </td>
                              <td>{product.category.name}</td>
                              <td>
                                <button
                                  type="button"
                                  className="stock-qty-chip"
                                  onClick={() => {
                                    setEditCell({
                                      buildingId: selectedBuildingId,
                                      buildingName: selectedBuildingName,
                                      productId: product.id,
                                      productName: product.name,
                                      quantity: cell?.quantity ?? 0,
                                    });
                                    setEditQty(String(cell?.quantity ?? 0));
                                  }}
                                  title="Clic para ajustar stock"
                                >
                                  <span className="stock-qty-value">{cell?.quantity ?? 0}</span>
                                  <span className="stock-qty-unit">{unitLabel}</span>
                                </button>
                              </td>
                              <td>
                                {alert ? (
                                  <div className={alertChipClass(alert.status)}>
                                    <strong>
                                      {BUILDING_STOCK_ALERT_STATUS_LABELS[alert.status]}
                                    </strong>
                                    <span>
                                      {BUILDING_STOCK_ALERT_TYPE_LABELS[alert.alertType]}
                                      {alert.status === 'IN_TRANSIT' && alert.deliveryDate
                                        ? ` · ${formatDeliveryDate(alert.deliveryDate)}`
                                        : ''}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted text-sm">—</span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() =>
                                    setHistoryTarget({
                                      productId: product.id,
                                      productName: product.name,
                                      buildingId: selectedBuildingId,
                                      buildingName: selectedBuildingName,
                                    })
                                  }
                                >
                                  Ver
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted" style={{ marginTop: 16 }}>
              Seleccioná un edificio para ver su inventario.
            </p>
          )}
        </section>
      </div>

      {editCell ? (
        <div className="modal-overlay" role="presentation" onClick={() => setEditCell(null)}>
          <div
            className="modal"
            role="dialog"
            aria-labelledby="edit-stock-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-stock-title" className="modal-title">
              Ajustar stock — {editCell.productName}
            </h2>
            <p className="text-muted" style={{ marginTop: 0 }}>
              {editCell.buildingName}
            </p>
            <div className="form-field">
              <label htmlFor="edit-qty">Cantidad</label>
              <input
                id="edit-qty"
                type="number"
                className="input"
                min={0}
                step="any"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditCell(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void saveQuantity()}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <StockMovementHistoryModal
        open={historyTarget != null}
        onClose={() => setHistoryTarget(null)}
        productId={historyTarget?.productId ?? ''}
        productName={historyTarget?.productName ?? ''}
        buildingId={historyTarget?.buildingId}
        buildingName={historyTarget?.buildingName}
      />
    </>
  );
}
