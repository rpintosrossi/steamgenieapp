export const BUILDING_STOCK_ALERT_TYPES = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'OBSERVATION',
] as const;

export type BuildingStockAlertType = (typeof BUILDING_STOCK_ALERT_TYPES)[number];

export const BUILDING_STOCK_ALERT_TYPE_LABELS: Record<BuildingStockAlertType, string> = {
  LOW_STOCK: 'Stock bajo',
  OUT_OF_STOCK: 'Sin stock',
  OBSERVATION: 'Observación',
};

export const BUILDING_STOCK_ALERT_STATUSES = ['OPEN', 'IN_TRANSIT', 'RESOLVED'] as const;

export type BuildingStockAlertStatus = (typeof BUILDING_STOCK_ALERT_STATUSES)[number];

export const BUILDING_STOCK_ALERT_STATUS_LABELS: Record<BuildingStockAlertStatus, string> = {
  OPEN: 'Pendiente',
  IN_TRANSIT: 'En camino',
  RESOLVED: 'Resuelta',
};

export const STOCK_SHIPMENT_ORDER_STATUSES = [
  'DRAFT',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;

export type StockShipmentOrderStatus = (typeof STOCK_SHIPMENT_ORDER_STATUSES)[number];

export const STOCK_SHIPMENT_ORDER_STATUS_LABELS: Record<StockShipmentOrderStatus, string> = {
  DRAFT: 'Borrador',
  DISPATCHED: 'Despachada',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
};

export const STOCK_SHIPMENT_DESTINATION_STATUSES = [
  'PENDING',
  'DELIVERED',
  'CANCELLED',
] as const;

export type StockShipmentDestinationStatus =
  (typeof STOCK_SHIPMENT_DESTINATION_STATUSES)[number];

export const STOCK_SHIPMENT_DESTINATION_STATUS_LABELS: Record<
  StockShipmentDestinationStatus,
  string
> = {
  PENDING: 'Pendiente',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
};
