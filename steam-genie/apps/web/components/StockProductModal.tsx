'use client';

import { FormEvent, useEffect, useState } from 'react';
import { STOCK_UNIT_LABELS, STOCK_UNIT_TYPES } from '@steam-genie/shared-constants';
import type { StockCategoryItem, StockProductItem, StockSupplierItem } from '../lib/types';

export interface StockProductFormState {
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  supplierId: string;
  quantity: string;
  minQuantity: string;
  unitType: string;
  isActive: boolean;
}

const EMPTY_FORM: StockProductFormState = {
  name: '',
  sku: '',
  description: '',
  categoryId: '',
  supplierId: '',
  quantity: '0',
  minQuantity: '5',
  unitType: 'UNIT',
  isActive: true,
};

interface StockProductModalProps {
  open: boolean;
  editing: StockProductItem | null;
  categories: StockCategoryItem[];
  suppliers: StockSupplierItem[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: StockProductFormState) => Promise<void>;
}

export function StockProductModal({
  open,
  editing,
  categories,
  suppliers,
  saving,
  onClose,
  onSubmit,
}: StockProductModalProps) {
  const [form, setForm] = useState<StockProductFormState>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        sku: editing.sku ?? '',
        description: editing.description ?? '',
        categoryId: editing.categoryId,
        supplierId: editing.supplierId ?? '',
        quantity: String(editing.quantity),
        minQuantity: String(editing.minQuantity),
        unitType: editing.unitType,
        isActive: editing.isActive,
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        categoryId: categories[0]?.id ?? '',
      });
    }
  }, [open, editing, categories]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(form);
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-product-modal-title"
      >
        <div className="modal-header">
          <h2 id="stock-product-modal-title" className="modal-title">
            {editing ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <div className="grid-2">
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="stock-name">Nombre</label>
            <input
              id="stock-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              maxLength={300}
            />
          </div>

          <div className="form-field">
            <label htmlFor="stock-sku">SKU</label>
            <input
              id="stock-sku"
              className="input"
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              maxLength={100}
            />
          </div>

          <div className="form-field">
            <label htmlFor="stock-unit">Tipo de unidad</label>
            <select
              id="stock-unit"
              className="input"
              value={form.unitType}
              onChange={(e) => setForm((f) => ({ ...f, unitType: e.target.value }))}
              required
            >
              {STOCK_UNIT_TYPES.map((unit) => (
                <option key={unit} value={unit}>
                  {STOCK_UNIT_LABELS[unit]}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="stock-category">Categoría</label>
            <select
              id="stock-category"
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              required
            >
              <option value="">Seleccionar…</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="stock-supplier">Proveedor</label>
            <select
              id="stock-supplier"
              className="input"
              value={form.supplierId}
              onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="stock-quantity">Cantidad actual</label>
            <input
              id="stock-quantity"
              className="input"
              type="number"
              min={0}
              step="any"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="stock-min">Mínimo (alerta stock bajo)</label>
            <input
              id="stock-min"
              className="input"
              type="number"
              min={0}
              step="any"
              value={form.minQuantity}
              onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))}
              required
            />
          </div>

          <div className="form-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="stock-desc">Descripción</label>
            <textarea
              id="stock-desc"
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={500}
            />
          </div>

          {editing ? (
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Producto activo
              </label>
            </div>
          ) : null}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
