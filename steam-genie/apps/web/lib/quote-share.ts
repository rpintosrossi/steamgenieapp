import { formatQuoteNumber } from '@steam-genie/shared-constants';
import { api } from './api-client';

export function normalizePhoneForWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) digits = digits.slice(1);
  // Celular local AR con 15 → formato internacional 549…
  if (digits.startsWith('15') && digits.length >= 10) {
    digits = `9${digits.slice(2)}`;
  }
  return `54${digits}`;
}

function money(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value);
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function loadQuotePdf(quoteId: string, number: number) {
  const filename = `presupuesto-${formatQuoteNumber(number)}.pdf`;
  const blob = await api.fetchBlob(`/quotes/${quoteId}/pdf`);
  const file = new File([blob], filename, { type: 'application/pdf' });
  return { blob, file, filename };
}

type ShareQuoteInput = {
  id: string;
  number: number;
  total: string | number;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

/** Intenta compartir el PDF (p. ej. WhatsApp en mobile). Si no, descarga + abre chat. */
export async function shareQuoteWhatsApp(quote: ShareQuoteInput): Promise<string> {
  const phone = quote.contactPhone?.trim();
  if (!phone) {
    throw new Error('Cargá el celular del cliente para abrir WhatsApp.');
  }

  const text = `Hola! Te envío el presupuesto N° ${formatQuoteNumber(quote.number)} de STEAMGENIE. Total: ${money(quote.total)}.`;
  const { blob, file, filename } = await loadQuotePdf(quote.id, quote.number);
  const waUrl = `https://wa.me/${normalizePhoneForWhatsApp(phone)}?text=${encodeURIComponent(text)}`;

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: `Presupuesto ${formatQuoteNumber(quote.number)}`,
        text,
      });
      return 'PDF compartido. Elegí WhatsApp si te lo ofrece el sistema.';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'Envío cancelado.';
      }
      // fallback abajo
    }
  }

  triggerDownload(blob, filename);
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return 'PDF descargado y WhatsApp abierto. Adjuntá el PDF en el chat.';
}

/** Descarga el PDF y abre el correo del cliente (mailto no permite adjuntos). */
export async function shareQuoteEmail(quote: ShareQuoteInput): Promise<string> {
  const email = quote.contactEmail?.trim();
  if (!email) {
    throw new Error('Cargá el correo del cliente para abrir el mail.');
  }

  const subject = `Presupuesto ${formatQuoteNumber(quote.number)} — STEAMGENIE`;
  const body = `Hola,\n\nTe envío el presupuesto N° ${formatQuoteNumber(quote.number)}.\nTotal: ${money(quote.total)}.\n\nEl PDF se descargó en tu equipo: adjuntarlo a este correo.\n\nSaludos,\nSTEAMGENIE`;
  const { blob, file, filename } = await loadQuotePdf(quote.id, quote.number);

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: subject,
        text: body,
      });
      return 'PDF compartido. Elegí Gmail/Correo si te lo ofrece el sistema.';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'Envío cancelado.';
      }
    }
  }

  triggerDownload(blob, filename);
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return 'PDF descargado y correo abierto. Adjuntá el PDF al mensaje.';
}
