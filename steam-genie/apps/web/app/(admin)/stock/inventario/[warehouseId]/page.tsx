'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STOCK_STATUS_LABELS,
  STOCK_UNIT_LABELS,
} from '@steam-genie/shared-constants';
import { StockProductModal, type StockProductFormState } from '../../../../../components/StockProductModal';
import { StockMovementHistoryModal } from '../../../../../components/StockMovementHistoryModal';
import { StockSubnav } from '../../../../../components/StockSubnav';
import { api } from '../../../../../lib/api-client';
import type {
  StockCategoryItem,
  StockProductGroup,
  StockProductItem,
  StockStats,
  StockSupplierItem,
  StockWarehouseItem,
} from '../../../../../lib/types';

const QUICK_AMOUNTS = [1, 5, 10, 25];
const PAGE_SIZE = 50;

type StatusFilter = 'ALL' | 'OK' | 'LOW' | 'OUT';

type CategorySummary = {
  category: { id: string; name: string; sortOrder: number };
  productCount: number;
  okCount: number;
  lowCount: number;
  outCount: number;
};

type CategoryProductsState = {
  products: StockProductItem[];
  page: number;
  pages: number;
  total: number;
  loading: boolean;
};

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

function patchCategoryData(
  data: Record<string, CategoryProductsState>,
  updates: StockProductItem[],
): Record<string, CategoryProductsState> {
  const byId = new Map(updates.map((product) => [product.id, product]));
  const next: Record<string, CategoryProductsState> = {};
  for (const [categoryId, state] of Object.entries(data)) {
    next[categoryId] = {
      ...state,
      products: state.products.map((product) => byId.get(product.id) ?? product),
    };
  }
  return next;
}

export default function StockWarehouseInventoryPage() {
  const params = useParams();
  const warehouseId = String(params.warehouseId ?? '');

  const [warehouse, setWarehouse] = useState<StockWarehouseItem | null>(null);
  const [stats, setStats] = useState<StockStats | null>(null);
  const [summaries, setSummaries] = useState<CategorySummary[]>([]);
  const [matchedTotal, setMatchedTotal] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [categoryData, setCategoryData] = useState<Record<string, CategoryProductsState>>({});
  const [categories, setCategories] = useState<StockCategoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<StockSupplierItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryNameFilter, setCategoryNameFilter] = useState('');
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
  const expandedIdsRef = useRef(expandedIds);
  expandedIdsRef.current = expandedIds;
  const categoryDataRef = useRef(categoryData);
  categoryDataRef.current = categoryData;

  const applyProductUpdates = useCallback((updates: StockProductItem[]) => {
    const prevData = categoryDataRef.current;
    const updatedById = new Map(updates.map((product) => [product.id, product]));
    const previousById = new Map<string, StockProductItem>();
    for (const state of Object.values(prevData)) {
      for (const product of state.products) {
        if (updatedById.has(product.id)) previousById.set(product.id, product);
      }
    }

    setCategoryData((prev) => patchCategoryData(prev, updates));
    setSummaries((prev) =>
      prev.map((summary) => {
        let okCount = summary.okCount;
        let lowCount = summary.lowCount;
        let outCount = summary.outCount;
        let changed = false;

        for (const updated of updates) {
          if (updated.categoryId !== summary.category.id) continue;
          const previous = previousById.get(updated.id);
          if (!previous || previous.status === updated.status) continue;
          changed = true;
          if (previous.status === 'OK') okCount -= 1;
          else if (previous.status === 'LOW') lowCount -= 1;
          else outCount -= 1;
          if (updated.status === 'OK') okCount += 1;
          else if (updated.status === 'LOW') lowCount += 1;
          else outCount += 1;
        }

        if (!changed) return summary;
        return {
          ...summary,
          okCount: Math.max(0, okCount),
          lowCount: Math.max(0, lowCount),
          outCount: Math.max(0, outCount),
          productCount: Math.max(0, okCount) + Math.max(0, lowCount) + Math.max(0, outCount),
        };
      }),
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const inventoryQuery = useMemo(() => {
    const params = new URLSearchParams({
      warehouseId,
      includeInactive: showInactive ? 'true' : 'false',
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    return params;
  }, [debouncedSearch, showInactive, statusFilter, warehouseId]);

  const loadCatalog = useCallback(async () => {
    try {
      const [categoriesRes, suppliersRes, warehouseRes] = await Promise.all([
        api.get<StockCategoryItem[]>('/stock/categories'),
        api.get<StockSupplierItem[]>('/stock/suppliers'),
        api.get<StockWarehouseItem>(`/stock/warehouses/${warehouseId}`),
      ]);
      setCategories(categoriesRes);
      setSuppliers(suppliersRes);
      setWarehouse(warehouseRes);
    } catch {
      // El modal puede recargar catálogo al abrir si hace falta.
    }
  }, [warehouseId]);

  const refreshStats = useCallback(async () => {
    if (!warehouseId) return;
    try {
      const statsRes = await api.get<StockStats>(`/stock/stats?warehouseId=${warehouseId}`);
      setStats(statsRes);
    } catch {
      // Conservar el último valor conocido.
    }
  }, [warehouseId]);

  const fetchCategoryProducts = useCallback(
    async (categoryId: string, page = 1) => {
      setCategoryData((prev) => ({
        ...prev,
        [categoryId]: {
          products: prev[categoryId]?.products ?? [],
          page,
          pages: prev[categoryId]?.pages ?? 1,
          total: prev[categoryId]?.total ?? 0,
          loading: true,
        },
      }));

      try {
        const params = new URLSearchParams(inventoryQuery);
        params.set('categoryId', categoryId);
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));

        const res = await api.get<{
          groups: StockProductGroup[];
          total: number;
          page: number;
          pages: number;
        }>(`/stock/products/grouped?${params}`);

        const products = res.groups[0]?.products ?? [];
        setCategoryData((prev) => ({
          ...prev,
          [categoryId]: {
            products,
            page: res.page,
            pages: Math.max(1, res.pages),
            total: res.total,
            loading: false,
          },
        }));
      } catch (e) {
        setCategoryData((prev) => ({
          ...prev,
          [categoryId]: {
            products: prev[categoryId]?.products ?? [],
            page: prev[categoryId]?.page ?? 1,
            pages: prev[categoryId]?.pages ?? 1,
            total: prev[categoryId]?.total ?? 0,
            loading: false,
          },
        }));
        setError(e instanceof Error ? e.message : 'Error al cargar productos');
      }
    },
    [inventoryQuery],
  );

  const loadSummaries = useCallback(
    async (options?: { silent?: boolean; ensureExpanded?: string[] }) => {
      if (!warehouseId) return;
      if (!options?.silent) {
        setInventoryLoading(true);
      }
      setError(null);
      try {
        const [statsRes, groupedRes] = await Promise.all([
          api.get<StockStats>(`/stock/stats?warehouseId=${warehouseId}`),
          api.get<{ groups: StockProductGroup[]; total?: number }>(
            `/stock/products/grouped?${inventoryQuery}&summaries=true`,
          ),
        ]);

        const nextSummaries: CategorySummary[] = groupedRes.groups.map((group) => {
          const okCount = group.okCount ?? 0;
          const lowCount = group.lowCount ?? 0;
          const outCount = group.outCount ?? 0;
          return {
            category: group.category,
            okCount,
            lowCount,
            outCount,
            productCount: group.productCount ?? okCount + lowCount + outCount,
          };
        });

        setStats(statsRes);
        setSummaries(nextSummaries);
        setMatchedTotal(groupedRes.total ?? nextSummaries.reduce((sum, item) => sum + item.productCount, 0));
        setCategoryData({});

        const available = new Set(nextSummaries.map((item) => item.category.id));
        const nextExpanded = new Set<string>();
        for (const id of expandedIdsRef.current) {
          if (available.has(id)) nextExpanded.add(id);
        }
        for (const id of options?.ensureExpanded ?? []) {
          if (available.has(id)) nextExpanded.add(id);
        }
        if (nextSummaries.length === 1) {
          nextExpanded.add(nextSummaries[0].category.id);
        } else if (debouncedSearch && nextSummaries.length > 0 && nextSummaries.length <= 3) {
          for (const item of nextSummaries) nextExpanded.add(item.category.id);
        }

        expandedIdsRef.current = nextExpanded;
        setExpandedIds(nextExpanded);
        hasLoadedOnce.current = true;

        await Promise.all([...nextExpanded].map((id) => fetchCategoryProducts(id, 1)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar inventario');
      } finally {
        setInitialLoading(false);
        setInventoryLoading(false);
      }
    },
    [debouncedSearch, fetchCategoryProducts, inventoryQuery, warehouseId],
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadSummaries({ silent: hasLoadedOnce.current });
  }, [loadSummaries]);

  const visibleSummaries = useMemo(() => {
    const term = categoryNameFilter.trim().toLowerCase();
    if (!term) return summaries;
    return summaries.filter((item) => item.category.name.toLowerCase().includes(term));
  }, [summaries, categoryNameFilter]);

  const allVisibleProducts = useMemo(
    () =>
      visibleSummaries.flatMap((item) =>
        expandedIds.has(item.category.id) ? (categoryData[item.category.id]?.products ?? []) : [],
      ),
    [visibleSummaries, expandedIds, categoryData],
  );

  function toggleCategory(categoryId: string) {
    const isOpen = expandedIds.has(categoryId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(categoryId);
      else next.add(categoryId);
      expandedIdsRef.current = next;
      return next;
    });
    if (!isOpen && !categoryData[categoryId]) {
      void fetchCategoryProducts(categoryId, 1);
    }
  }

  function collapseAll() {
    const empty = new Set<string>();
    expandedIdsRef.current = empty;
    setExpandedIds(empty);
  }

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
      const updated = await api.patch<StockProductItem>(`/stock/products/${id}/adjust`, {
        warehouseId,
        delta,
      });
      applyProductUpdates([updated]);
      void refreshStats();
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
        warehouseId,
        adjustments: [...selectedIds].map((productId) => ({ productId, delta })),
      });
      applyProductUpdates(result.updated);
      void refreshStats();
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
        warehouseId,
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

      let productId = editing?.id;
      if (editing) {
        await api.patch(`/stock/products/${editing.id}`, payload);
      } else {
        const created = await api.post<{ id: string }>('/stock/products', payload);
        productId = created.id;
      }

      if (productId && form.removeDatasheet && editing?.hasDatasheet) {
        await api.delete(`/stock/products/${productId}/datasheet`);
      }
      if (productId && form.datasheetFile) {
        await api.upload(`/stock/products/${productId}/datasheet`, form.datasheetFile);
      }

      setSuccess(editing ? 'Producto actualizado.' : 'Producto creado.');
      setModalOpen(false);
      setEditing(null);
      await loadSummaries({ silent: true, ensureExpanded: [form.categoryId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el producto');
      throw e;
    } finally {
      setSavingProduct(false);
    }
  }

  async function removeProduct(product: StockProductItem) {
    if (!window.confirm(`¿Eliminar "${product.name}" de este depósito?`)) return;

    setAdjustingId(product.id);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/stock/products/${product.id}?warehouseId=${warehouseId}`);
      setSuccess('Producto eliminado de este depósito.');
      await loadSummaries({ silent: true, ensureExpanded: [product.categoryId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el producto');
    } finally {
      setAdjustingId(null);
    }
  }

  async function downloadDatasheet(product: StockProductItem) {
    try {
      await api.download(
        `/stock/products/${product.id}/datasheet`,
        product.datasheetFileName ?? 'ficha-tecnica',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar la ficha técnica');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="text-muted text-sm" style={{ marginBottom: 4 }}>
            <Link href="/stock/inventario">← Depósitos</Link>
          </p>
          <h1 className="page-title">{warehouse?.name ?? 'Inventario'}</h1>
          <p className="page-subtitle">
            Inventario de este depósito. Abrí una categoría para ver y ajustar sus productos.
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
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
              }}
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
              onChange={(e) => {
                setShowInactive(e.target.checked);
              }}
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
      ) : summaries.length === 0 ? (
        <div className="card empty-state">
          <p>{inventoryLoading ? 'Actualizando inventario…' : 'No hay productos para mostrar.'}</p>
        </div>
      ) : (
        <>
          <div className="stock-category-toolbar">
            <p className="stock-category-toolbar-meta">
              {visibleSummaries.length} categoría{visibleSummaries.length === 1 ? '' : 's'}
              {visibleSummaries.length !== summaries.length ? ` de ${summaries.length}` : ''}
              {' · '}
              {matchedTotal} producto{matchedTotal === 1 ? '' : 's'}
              {debouncedSearch || statusFilter !== 'ALL' ? ' con este filtro' : ''}
            </p>
            <div className="stock-category-toolbar-actions">
              <input
                className="input"
                placeholder="Filtrar categorías…"
                value={categoryNameFilter}
                onChange={(e) => setCategoryNameFilter(e.target.value)}
                aria-label="Filtrar categorías por nombre"
                style={{ minWidth: 180, maxWidth: 260 }}
              />
              {expandedIds.size > 0 ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={collapseAll}>
                  Cerrar todas
                </button>
              ) : null}
            </div>
          </div>
          {inventoryLoading ? (
            <p className="muted" style={{ margin: '0 0 12px' }}>
              Actualizando inventario…
            </p>
          ) : null}
          <div className="stock-category-list">
            {visibleSummaries.length === 0 ? (
              <div className="card empty-state" style={{ margin: 0 }}>
                <p>Ninguna categoría coincide con “{categoryNameFilter.trim()}”.</p>
              </div>
            ) : null}
            {visibleSummaries.map((group) => {
              const isExpanded = expandedIds.has(group.category.id);
              const state = categoryData[group.category.id];
              const products = state?.products ?? [];
              const panelId = `stock-cat-${group.category.id}`;

              return (
                <div
                  key={group.category.id}
                  className={`stock-category-item${isExpanded ? ' is-expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="stock-category-toggle"
                    onClick={() => toggleCategory(group.category.id)}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                  >
                    <span className={`stock-category-chevron${isExpanded ? ' is-expanded' : ''}`} aria-hidden>
                      ▶
                    </span>
                    <span className="stock-category-toggle-title">{group.category.name}</span>
                    <span className="stock-category-counts" aria-label="Estado del stock en esta categoría">
                      <span className="stock-category-count stock-category-count--out">
                        {group.outCount} sin stock
                      </span>
                      <span className="stock-category-count stock-category-count--low">
                        {group.lowCount} alerta
                      </span>
                      <span className="stock-category-count stock-category-count--ok">
                        {group.okCount} ok
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div id={panelId} className="stock-category-body">
                      {state?.loading && products.length === 0 ? (
                        <div className="stock-category-loading">
                          <div className="spinner" role="status" aria-label="Cargando productos" />
                        </div>
                      ) : products.length === 0 ? (
                        <p className="muted" style={{ margin: 0, padding: '12px 16px' }}>
                          No hay productos en esta categoría.
                        </p>
                      ) : (
                        <>
                          {state?.loading ? (
                            <p className="muted" style={{ margin: '0 16px 8px' }}>
                              Actualizando productos…
                            </p>
                          ) : null}
                          <div className="table-wrap">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th style={{ width: 36 }}>
                                    <input
                                      type="checkbox"
                                      aria-label="Seleccionar todos en esta categoría"
                                      checked={
                                        products.length > 0 &&
                                        products.every((p) => selectedIds.has(p.id))
                                      }
                                      onChange={() => {
                                        const allSelected = products.every((p) => selectedIds.has(p.id));
                                        setSelectedIds((prev) => {
                                          const next = new Set(prev);
                                          for (const p of products) {
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
                                  <th>Ficha</th>
                                  <th>Última actualización</th>
                                  <th>Ajuste rápido</th>
                                  <th style={{ width: 100 }} />
                                </tr>
                              </thead>
                              <tbody>
                                {products.map((product) => {
                                  const busy = adjustingId === product.id;
                                  const unitLabel =
                                    STOCK_UNIT_LABELS[product.unitType as keyof typeof STOCK_UNIT_LABELS] ??
                                    product.unitType;
                                  return (
                                    <tr
                                      key={product.id}
                                      className={!product.isActive ? 'row-muted' : undefined}
                                    >
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
                                      <td>
                                        {product.hasDatasheet ? (
                                          <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => void downloadDatasheet(product)}
                                            title={product.datasheetFileName ?? 'Ficha técnica'}
                                          >
                                            Ver ficha
                                          </button>
                                        ) : (
                                          <span className="muted">—</span>
                                        )}
                                      </td>
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
                          {(state?.pages ?? 1) > 1 ? (
                            <div className="pagination" style={{ margin: '8px 16px 12px' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={(state?.page ?? 1) <= 1 || Boolean(state?.loading)}
                                onClick={() =>
                                  void fetchCategoryProducts(group.category.id, Math.max(1, (state?.page ?? 1) - 1))
                                }
                              >
                                Anterior
                              </button>
                              <span className="pagination-info">
                                Página {state?.page ?? 1} de {state?.pages ?? 1} · {state?.total ?? products.length}{' '}
                                producto{(state?.total ?? products.length) === 1 ? '' : 's'}
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={
                                  (state?.page ?? 1) >= (state?.pages ?? 1) || Boolean(state?.loading)
                                }
                                onClick={() =>
                                  void fetchCategoryProducts(
                                    group.category.id,
                                    Math.min(state?.pages ?? 1, (state?.page ?? 1) + 1),
                                  )
                                }
                              >
                                Siguiente
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {allVisibleProducts.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={
                allVisibleProducts.length > 0 && selectedIds.size === allVisibleProducts.length
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
        onDownloadDatasheet={(product) => void downloadDatasheet(product)}
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
        warehouseId={warehouseId}
      />
    </>
  );
}
