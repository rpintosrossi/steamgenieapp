export const STOCK_UNIT_TYPES = [
  'UNIT',
  'LITER',
  'KILOGRAM',
  'GRAM',
  'MILLILITER',
  'PACK',
  'BOX',
  'BOTTLE',
  'ROLL',
  'OTHER',
] as const;

export type StockUnitType = (typeof STOCK_UNIT_TYPES)[number];

export const STOCK_UNIT_LABELS: Record<StockUnitType, string> = {
  UNIT: 'Unidad',
  LITER: 'Litro',
  KILOGRAM: 'Kilogramo',
  GRAM: 'Gramo',
  MILLILITER: 'Mililitro',
  PACK: 'Pack',
  BOX: 'Caja',
  BOTTLE: 'Botella',
  ROLL: 'Rollo',
  OTHER: 'Otro',
};

export type StockStatus = 'OK' | 'LOW' | 'OUT';

export function computeStockStatus(
  quantity: number,
  minQuantity: number,
): StockStatus {
  if (quantity <= 0) return 'OUT';
  if (quantity <= minQuantity) return 'LOW';
  return 'OK';
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  OK: 'Disponible',
  LOW: 'Stock bajo',
  OUT: 'Sin stock',
};
