import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildQuotePdfFilename } from '@steam-genie/shared-constants';
import { getApiBaseUrl } from '../config/api';
import { useAuthStore } from '../stores/auth.store';

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.endsWith('.pdf') ? cleaned : `${cleaned || 'documento'}.pdf`;
}

export type DownloadedPdf = {
  uri: string;
  filename: string;
};

/** Descarga un PDF autenticado a caché (sin compartir). */
export async function downloadPdfToCache(
  path: string,
  filename: string,
): Promise<DownloadedPdf> {
  const token = await useAuthStore.getState().ensureAccessToken();
  if (!token) {
    throw new Error('Sesión no iniciada. Volvé a iniciar sesión.');
  }

  const base = FileSystem.cacheDirectory;
  if (!base) {
    throw new Error('No se pudo acceder al almacenamiento del dispositivo.');
  }

  const safeName = sanitizeFilename(filename);
  const target = `${base}${safeName}`;
  const url = path.startsWith('http')
    ? path
    : `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

  const result = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error('No se pudo descargar el PDF.');
  }

  return { uri: result.uri, filename: safeName };
}

/** Abre el sheet nativo para compartir/guardar un PDF local. */
export async function shareLocalPdf(uri: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Este dispositivo no permite compartir archivos.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Presupuesto PDF',
    UTI: 'com.adobe.pdf',
  });
}

export function quotePdfFilename(quote: {
  number: number;
  particularClient?: { name: string } | null;
  eventualClient?: { name: string } | null;
  building?: { name: string } | null;
}): string {
  const clientName =
    quote.particularClient?.name?.trim() ||
    quote.eventualClient?.name?.trim() ||
    quote.building?.name?.trim() ||
    'Cliente';
  return buildQuotePdfFilename(clientName, quote.number);
}
