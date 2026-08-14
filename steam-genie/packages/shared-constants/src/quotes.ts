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

/** Sucursal inicial / fallback si no hay otra configurada. */
export const QUOTE_DEFAULT_BRANCH = {
  name: 'Buenos Aires',
  address: QUOTE_COMPANY.address,
  phone: QUOTE_COMPANY.phone,
} as const;

export function formatQuoteNumber(number: number): string {
  return String(number).padStart(8, '0');
}

/** Nombre de archivo seguro para PDF: NOMBRE-NUMERO.pdf */
export function buildClientPdfFilename(
  clientName: string,
  numberPart: string | number,
): string {
  const name = sanitizeQuoteFilenamePart(clientName);
  const number =
    typeof numberPart === 'number'
      ? formatQuoteNumber(numberPart)
      : sanitizeQuoteFilenamePart(String(numberPart)) || '00000000';
  return `${name}-${number}.pdf`;
}

export function buildQuotePdfFilename(clientName: string, number: number): string {
  return buildClientPdfFilename(clientName, number);
}

function sanitizeQuoteFilenamePart(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'Cliente';
}
