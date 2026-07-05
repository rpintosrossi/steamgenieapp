'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STOCK_STATUS_LABELS,
  STOCK_UNIT_LABELS,
} from '@steam-genie/shared-constants';
import { StockProductModal, type StockProductFormState } from '../../../../components/StockProductModal';
import { StockMovementHistoryModal } from '../../../../components/StockMovementHistoryModal';
import { StockSubnav } from '../../../../components/StockSubnav';
import { api } from '../../../../lib/api-client';
import type {
  StockCategoryItem,
  StockProductGroup,
  StockProductItem,
  StockStats,
  StockSupplierItem,
} from '../../../../lib/types';

const QUICK_AMOUNTS = [1, 5, 10, 25];

type StatusFilter = 'ALL' | 'OK' | 'LOW' | 'OUT';

function statusBadgeClass(status: StockProductItem['status']) {
  if (status === 'OUT') return 'badge badge-error';
  if (status === 'LOW') return 'badge badge-warning';
  return 'badge badge-success';
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeStats(products: StockProductItem[]): StockStats {
  const active = products.filter((p) => p.isActive);
  let lowStock = 0;
  let outOfStock = 0;

  for (const product of active) {
    if (product.status === 'OUT') outOfStock += 1;
    else if (product.status === 'LOW') lowStock += 1;
  }

  return {
    totalProducts: active.length,
    lowStock,
    outOfStock,
  };
}

function patchGroups(
  groups: StockProductGroup[],
  updates: StockProductItem[],
): StockProductGroup[] {
  const byId = new Map(updates.map((product) => [product.id, product]));
  return groups.map((group) => ({
    ...group,
    products: group.products.map((product) => byId.get(product.id) ?? product),
  }));
}

export default function StockInventoryPage() {
  const [stats, setStats] = useState<StockStats | null>(null);
  const [groups, setGroups] = useState<StockProductGroup[]>([]);
  const [categories, setCategories] = useState<StockCategoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<StockSupplierItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [showInactive, setShowInactive] = useState(false);

  const [adjustAmount, setAdjustAmount] = useState(1);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDelta, setBulkDelta] = useState(1);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StockProductItem | null>(null);
  const [historyProduct, setHistoryProduct] = useState<StockProductItem | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const hasLoadedOnce = useRef(false);

  const applyProductUpdates = useCallback((updates: StockProductItem[]) => {
    setGroups((prev) => {
      const next = patchGroups(prev, updates);
      setStats(computeStats(next.flatMap((group) => group.products)));
      return next;
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadCatalog = useCallback(async () => {
    try {
      const [categoriesRes, suppliersRes] = await Promise.all([
        api.get<StockCategoryItem[]>('/stock/categories'),
        api.get<StockSupplierItem[]>('/stock/suppliers'),
      ]);
      setCategories(categoriesRes);
      setSuppliers(suppliersRes);
    } catch {
      // El modal puede recargar catálogo al abrir si hace falta.
    }
  }, []);

  const loadInventory = useCallback(async (silent = false) => {
    if (!silent) {
      setInventoryLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({
        includeInactive: showInactive ? 'true' : 'false',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      const [statsRes, groupedRes] = await Promise.all([
        api.get<StockStats>('/stock/stats'),
        api.get<{ groups: StockProductGroup[] }>(`/stock/products/grouped?${params}`),
      ]);

      setStats(statsRes);
      setGroups(groupedRes.groups);
      hasLoadedOnce.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar inventario');
    } finally {
      setInitialLoading(false);
      setInventoryLoading(false);
    }
  }, [debouncedSearch, showInactive]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadInventory(hasLoadedOnce.current);
  }, [loadInventory]);

  const filteredGroups = useMemo(() => {
    if (statusFilter === 'ALL') return groups;
    return groups
      .map((group) => ({
        ...group,
        products: group.products.filter((p) => p.status === statusFilter),
      }))
      .filter((group) => group.products.length > 0);
  }, [groups, statusFilter]);

  const allVisibleProducts = useMemo(
    () => filteredGroups.flatMap((g) => g.products),
    [filteredGroups],
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === allVisibleProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleProducts.map((p) => p.id)));
    }
  }

  async function adjustProduct(id: string, delta: number) {
    setAdjustingId(id);
    setError(null);
    try {
      const updated = await api.patch<StockProductItem>(`/stock/products/${id}/adjust`, { delta });
      applyProductUpdates([updated]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ajustar el stock');
    } finally {
      setAdjustingId(null);
    }
  }

  async function applyBulkAdjust(sign: 1 | -1) {
    const delta = bulkDelta * sign;
    if (selectedIds.size === 0) {
      setError('Seleccioná al menos un producto.');
      return;
    }

    setBulkSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.post<{ updated: StockProductItem[] }>('/stock/products/bulk-adjust', {
        adjustments: [...selectedIds].map((productId) => ({ productId, delta })),
      });
      applyProductUpdates(result.updated);
      setSuccess(
        `Ajuste masivo aplicado a ${selectedIds.size} producto(s): ${delta > 0 ? '+' : ''}${delta}.`,
      );
      setSelectedIds(new Set());
      setBulkOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el ajuste masivo');
    } finally {
      setBulkSaving(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  }

  function openEdit(product: StockProductItem) {
    setEditing(product);
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  }

  async function saveProduct(form: StockProductFormState) {
    setSavingProduct(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        description: form.description.trim() || undefined,
        categoryId: form.categoryId,
        supplierId: form.supplierId || null,
        quantity: Number(form.quantity),
        minQuantity: Number(form.minQuantity),
        unitType: form.unitType,
        ...(editing ? { isActive: form.isActive } : {}),
      };

      if (editing) {
        await api.patch(`/stock/products/${editing.id}`, payload);
        setSuccess('Producto actualizado.');
      } else {
        await api.post('/stock/products', payload);
        setSuccess('Producto creado.');
      }

      setModalOpen(false);
      setEditing(null);
      await loadInventory(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el producto');
      throw e;
    } finally {
      setSavingProduct(false);
    }
  }

  async function removeProduct(product: StockProductItem) {
    if (!window.confirm(`¿Eliminar "${product.name}" del inventario?`)) return;

    setAdjustingId(product.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/stock/products/${product.id}`);
      setSuccess('Producto eliminado.');
      await loadInventory(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el producto');
    } finally {
      setAdjustingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario</h1>
          <p className="page-subtitle">
            Inventario de insumos agrupado por categoría, con ajustes rápidos individuales o masivos.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Nuevo producto
        </button>
      </div>

      <StockSubnav />

      {stats ? (
        <div className="hierarchy-stats" style={{ marginBottom: 20 }}>
          <div className="hierarchy-stat-chip">
            <span className="hierarchy-stat-value">{stats.totalProducts}</span>
            <span className="hierarchy-stat-label">Total productos</span>
          </div>
          <div className="hierarchy-stat-chip">
            <span className="hierarchy-stat-value" style={{ color: 'var(--color-warning)' }}>
              {stats.lowStock}
            </span>
            <span className="hierarchy-stat-label">Stock bajo</span>
          </div>
          <div className="hierarchy-stat-chip">
            <span className="hierarchy-stat-value" style={{ color: 'var(--color-error)' }}>
              {stats.outOfStock}
            </span>
            <span className="hierarchy-stat-label">Sin stock</span>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16, padding: '16px 20px' }}>
        <div className="stock-toolbar">
          <div className="form-field" style={{ margin: 0, flex: '1 1 200px' }}>
            <label htmlFor="stock-search">Buscar</label>
            <input
              id="stock-search"
              className="input"
              placeholder="Nombre o SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="stock-filter">Estado</label>
            <select
              id="stock-filter"
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="ALL">Todos</option>
              <option value="OK">Disponible</option>
              <option value="LOW">Stock bajo</option>
              <option value="OUT">Sin stock</option>
            </select>
          </div>

          <div className="form-field" style={{ margin: 0 }}>
            <label htmlFor="stock-adjust-amt">Cantidad rápida</label>
            <select
              id="stock-adjust-amt"
              className="input"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(Number(e.target.value))}
            >
              {QUICK_AMOUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <label className="checkbox-label" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Incluir inactivos
          </label>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-end' }}
            disabled={selectedIds.size === 0}
            onClick={() => setBulkOpen(true)}
          >
            Ajuste masivo ({selectedIds.size})
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      {initialLoading ? (
        <div className="card">
          <div className="loading-state">
            <div className="spinner" role="status" aria-label="Cargando" />
          </div>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="card empty-state">
          <p>{inventoryLoading ? 'Actualizando inventario…' : 'No hay productos para mostrar.'}</p>
        </div>
      ) : (
        <>
          {inventoryLoading ? (
            <p className="muted" style={{ margin: '0 0 12px' }}>
              Actualizando inventario…
            </p>
          ) : null}
          {filteredGroups.map((group) => (
          <div key={group.category.id} className="card" style={{ marginBottom: 16 }}>
            <h2 className="stock-category-title">{group.category.name}</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos en esta categoría"
                        checked={
                          group.products.length > 0 &&
                          group.products.every((p) => selectedIds.has(p.id))
                        }
                        onChange={() => {
                          const allSelected = group.products.every((p) => selectedIds.has(p.id));
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            for (const p of group.products) {
                              if (allSelected) next.delete(p.id);
                              else next.add(p.id);
                            }
                            return next;
                          });
                        }}
                      />
                    </th>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Estado</th>
                    <th>Proveedor</th>
                    <th>Última actualización</th>
                    <th>Ajuste rápido</th>
                    <th style={{ width: 100 }} />
                  </tr>
                </thead>
                <tbody>
                  {group.products.map((product) => {
                    const busy = adjustingId === product.id;
                    const unitLabel = STOCK_UNIT_LABELS[product.unitType as keyof typeof STOCK_UNIT_LABELS] ?? product.unitType;
                    return (
                      <tr key={product.id} className={!product.isActive ? 'row-muted' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            aria-label={`Seleccionar ${product.name}`}
                          />
                        </td>
                        <td>
                          <strong>{product.name}</strong>
                          {product.sku ? (
                            <div className="text-muted text-sm">SKU: {product.sku}</div>
                          ) : null}
                          <div className="text-muted text-sm">{unitLabel}</div>
                        </td>
                        <td>
                          <strong>{product.quantity}</strong>{' '}
                          <span className="text-muted text-sm">{unitLabel}</span>
                        </td>
                        <td>
                          <span className={statusBadgeClass(product.status)}>
                            {STOCK_STATUS_LABELS[product.status]}
                          </span>
                        </td>
                        <td>{product.supplier?.name ?? '—'}</td>
                        <td>{formatDateTime(product.stockUpdatedAt)}</td>
                        <td>
                          <div className="stock-quick-adjust">
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              disabled={busy}
                              onClick={() => void adjustProduct(product.id, -adjustAmount)}
                              aria-label={`Restar ${adjustAmount}`}
                            >
                              −{adjustAmount}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() => void adjustProduct(product.id, adjustAmount)}
                              aria-label={`Sumar ${adjustAmount}`}
                            >
                              +{adjustAmount}
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setHistoryProduct(product)}
                            >
                              Historial
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openEdit(product)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => void removeProduct(product)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          ))}
        </>
      )}

      {allVisibleProducts.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={
                allVisibleProducts.length > 0 &&
                selectedIds.size === allVisibleProducts.length
              }
              onChange={toggleSelectAll}
            />
            Seleccionar todos los productos visibles ({allVisibleProducts.length})
          </label>
        </div>
      ) : null}

      <StockProductModal
        open={modalOpen}
        editing={editing}
        categories={categories}
        suppliers={suppliers}
        saving={savingProduct}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={saveProduct}
      />

      {bulkOpen ? (
        <div className="modal-overlay" onClick={() => setBulkOpen(false)} role="presentation">
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-adjust-title"
          >
            <div className="modal-header">
              <h2 id="bulk-adjust-title" className="modal-title">
                Ajuste masivo de stock
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setBulkOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <p>
              Se aplicará el mismo cambio a <strong>{selectedIds.size}</strong> producto(s)
              seleccionado(s).
            </p>
            <div className="form-field">
              <label htmlFor="bulk-delta">Cantidad por producto</label>
              <input
                id="bulk-delta"
                className="input"
                type="number"
                min={1}
                value={bulkDelta}
                onChange={(e) => setBulkDelta(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={bulkSaving}
                onClick={() => void applyBulkAdjust(-1)}
              >
                Restar −{bulkDelta}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={bulkSaving}
                onClick={() => void applyBulkAdjust(1)}
              >
                Sumar +{bulkDelta}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <StockMovementHistoryModal
        open={historyProduct != null}
        onClose={() => setHistoryProduct(null)}
        productId={historyProduct?.id ?? ''}
        productName={historyProduct?.name ?? ''}
      />
    </>
  );
}
