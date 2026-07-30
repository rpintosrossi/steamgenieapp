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

/** Texto por defecto de “El servicio incluye” (una línea = un ítem del PDF). */
export const QUOTE_DEFAULT_SERVICE_INCLUDES = [
  'Insumos requeridos para el servicio',
  'Indumentaria',
  'Todos los seguros correspondientes del operario',
].join('\n');

export function parseQuoteServiceIncludes(value?: string | null): string[] {
  const raw = value?.trim() ? value : QUOTE_DEFAULT_SERVICE_INCLUDES;
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean);
}

export const QUOTE_COMPANY = {
  name: 'STEAM GENIE',
  address: 'REPUBLICA 5549 V BALLESTER',
  phone: '5263-2848',
  website: 'STEAMGENIE.AR',
  taxId: '30709796859',
  taxStatus: 'I.V.A. Responsable Inscripto',
} as const;

export function formatQuoteNumber(number: number): string {
  return String(number).padStart(8, '0');
}
