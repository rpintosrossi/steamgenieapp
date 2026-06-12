export const WORK_ORDER_TYPE_LABELS: Record<string, string> = {
  CHECKOUT_CLEANING: 'Limpieza checkout',
  ADDITIONAL_REQUEST: 'Pedido adicional',
};

export function getWorkOrderTypeLabel(type: string): string {
  return WORK_ORDER_TYPE_LABELS[type] ?? type;
}
