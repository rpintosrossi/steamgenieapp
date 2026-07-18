export const QUOTE_STATUSES = {
  COTIZADO: 'COTIZADO',
  EN_ESPERA: 'EN_ESPERA',
  ACEPTADO: 'ACEPTADO',
  RECHAZADO: 'RECHAZADO',
  TERMINADO: 'TERMINADO',
} as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[keyof typeof QUOTE_STATUSES];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  COTIZADO: 'Cotizado',
  EN_ESPERA: 'En espera',
  ACEPTADO: 'Aceptado',
  RECHAZADO: 'Rechazado',
  TERMINADO: 'Terminado',
};

export const QUOTE_VAT_RATE = 21;

export const QUOTE_COMPANY = {
  name: 'STEAMGENIE',
  address: 'REPUBLICA 5549 V BALLESTER',
  phone: '5263-2848',
  website: 'STEAMGENIE.AR',
  taxId: '30709796859',
  taxStatus: 'I.V.A. Responsable Inscripto',
} as const;

export function formatQuoteNumber(number: number): string {
  return String(number).padStart(8, '0');
}
