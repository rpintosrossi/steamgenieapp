export const STOCK_MOVEMENT_TYPES = [
  'DEPOT_INITIAL',
  'DEPOT_ADJUST',
  'DEPOT_SET',
  'DEPOT_RESERVE',
  'DEPOT_RESERVE_RELEASE',
  'DEPOT_SHIP_OUT',
  'BUILDING_SET',
  'BUILDING_RECEIVE',
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  DEPOT_INITIAL: 'Stock inicial en depósito',
  DEPOT_ADJUST: 'Ajuste en depósito',
  DEPOT_SET: 'Stock fijado en depósito',
  DEPOT_RESERVE: 'Reserva por envío',
  DEPOT_RESERVE_RELEASE: 'Liberación de reserva',
  DEPOT_SHIP_OUT: 'Salida de depósito por envío',
  BUILDING_SET: 'Ajuste manual en edificio',
  BUILDING_RECEIVE: 'Recepción en edificio',
};

export const STOCK_MOVEMENT_SCOPE_LABELS = {
  DEPOT: 'Depósito',
  BUILDING: 'Edificio',
} as const;
