import { STOCK_UNIT_LABELS } from '@steam-genie/shared-constants';
import type { StockProductItem } from './types';

export type DraftLine = { productId: string; quantity: string };
export type DraftDestination = { buildingId: string; lines: DraftLine[] };

export function emptyDestination(): DraftDestination {
  return { buildingId: '', lines: [{ productId: '', quantity: '1' }] };
}

export function depotAvailable(product: StockProductItem): number {
  if (product.available != null) return product.available;
  if (product.availableQuantity != null) return product.availableQuantity;
  return Math.max(0, product.quantity - (product.reservedQuantity ?? 0));
}

export function productUnitLabel(product: StockProductItem): string {
  return (
    STOCK_UNIT_LABELS[product.unitType as keyof typeof STOCK_UNIT_LABELS] ??
    product.unitType
  );
}

export function productDepotLabel(product: StockProductItem): string {
  const avail = depotAvailable(product);
  return `${product.name} — depósito: ${avail} ${productUnitLabel(product)}`;
}

/** Productos elegibles en una línea (sin repetir en el mismo edificio). */
export function selectableProductsForLine(
  products: StockProductItem[],
  destLines: DraftLine[],
  lineIndex: number,
): StockProductItem[] {
  const takenInDest = new Set(
    destLines
      .map((line, idx) => (idx !== lineIndex ? line.productId : ''))
      .filter(Boolean),
  );
  const currentId = destLines[lineIndex]?.productId ?? '';
  return products.filter((p) => !takenInDest.has(p.id) || p.id === currentId);
}

export function canAddProductLine(destLines: DraftLine[], products: StockProductItem[]): boolean {
  const selected = new Set(destLines.map((l) => l.productId).filter(Boolean));
  return selected.size < products.length;
}

/** Total pedido por producto en toda la orden (borrador). */
export function totalQtyByProduct(destinations: DraftDestination[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const dest of destinations) {
    for (const line of dest.lines) {
      if (!line.productId) continue;
      const qty = Number(line.quantity);
      if (Number.isNaN(qty) || qty <= 0) continue;
      totals.set(line.productId, (totals.get(line.productId) ?? 0) + qty);
    }
  }
  return totals;
}

/** Cantidad máxima permitida en una línea según depósito y el resto de la orden. */
export function maxQtyForLine(
  destinations: DraftDestination[],
  destIndex: number,
  lineIndex: number,
  productsById: Map<string, StockProductItem>,
): number | null {
  const line = destinations[destIndex]?.lines[lineIndex];
  if (!line?.productId) return null;
  const product = productsById.get(line.productId);
  if (!product) return null;

  const depot = depotAvailable(product);
  let usedElsewhere = 0;
  destinations.forEach((dest, di) => {
    dest.lines.forEach((l, li) => {
      if (l.productId !== line.productId) return;
      if (di === destIndex && li === lineIndex) return;
      const qty = Number(l.quantity);
      if (!Number.isNaN(qty) && qty > 0) usedElsewhere += qty;
    });
  });
  return Math.max(0, depot - usedElsewhere);
}

export function validateShipmentDraft(
  destinations: DraftDestination[],
  productsById: Map<string, StockProductItem>,
): string | null {
  const withBuildings = destinations.filter((d) => d.buildingId);
  if (withBuildings.length === 0) {
    return 'Agregá al menos un edificio destino.';
  }

  const buildingIds = new Set<string>();
  for (const dest of withBuildings) {
    if (buildingIds.has(dest.buildingId)) {
      return 'No podés repetir el mismo edificio en la orden.';
    }
    buildingIds.add(dest.buildingId);

    const productIds = new Set<string>();
    let hasLine = false;
    for (const line of dest.lines) {
      if (!line.productId) continue;
      if (productIds.has(line.productId)) {
        const name = productsById.get(line.productId)?.name ?? 'producto';
        return `«${name}» ya está en este edificio. Usá una sola línea por producto.`;
      }
      productIds.add(line.productId);

      const qty = Number(line.quantity);
      if (Number.isNaN(qty) || qty <= 0) {
        return 'Todas las cantidades deben ser mayores a cero.';
      }
      hasLine = true;
    }
    if (!hasLine) {
      return 'Cada edificio debe tener al menos un producto con cantidad.';
    }
  }

  const totals = totalQtyByProduct(destinations);
  for (const [productId, total] of totals) {
    const product = productsById.get(productId);
    if (!product) continue;
    const depot = depotAvailable(product);
    if (total > depot) {
      return `Stock insuficiente para «${product.name}»: pedís ${total} pero en depósito hay ${depot} ${productUnitLabel(product)} disponible(s).`;
    }
  }

  return null;
}

export interface ProductAllocationSummary {
  productId: string;
  name: string;
  unit: string;
  depot: number;
  allocated: number;
  remaining: number;
  over: boolean;
}

export function allocationSummary(
  destinations: DraftDestination[],
  productsById: Map<string, StockProductItem>,
): ProductAllocationSummary[] {
  const totals = totalQtyByProduct(destinations);
  if (totals.size === 0) return [];

  return [...totals.entries()].map(([productId, allocated]) => {
    const product = productsById.get(productId)!;
    const depot = depotAvailable(product);
    return {
      productId,
      name: product.name,
      unit: productUnitLabel(product),
      depot,
      allocated,
      remaining: depot - allocated,
      over: allocated > depot,
    };
  });
}
