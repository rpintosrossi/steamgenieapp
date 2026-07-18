import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { QUOTE_COMPANY, formatQuoteNumber } from '@steam-genie/shared-constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

/** Colores de marca SteamGenie (alineados al panel web). */
const COLORS = {
  navy: '#0a1628',
  primary: '#2f6fed',
  primaryDark: '#1d4ed8',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  surface: '#f8fafc',
  white: '#ffffff',
  rowAlt: '#f1f5f9',
  accent: '#93c5fd',
};

export type QuotePdfPayload = {
  number: number;
  requestDate: string;
  statusLabel: string;
  clientName: string;
  clientTaxId: string | null;
  clientAddress: string | null;
  clientContact: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  sellerName: string | null;
  paymentCondition: string | null;
  paymentTerms: string | null;
  observations: string | null;
  validUntil: string | null;
  serviceType: string | null;
  subtotal: number;
  discountPercent: number | null;
  vatRate: number;
  vatAmount: number;
  total: number;
  items: Array<{
    quantity: number;
    description: string;
    unitPrice: number;
    discountPercent: number | null;
    lineTotal: number;
  }>;
};

type PdfDoc = InstanceType<typeof PDFDocument>;

@Injectable()
export class QuotePdfService {
  private readonly logger = new Logger(QuotePdfService.name);

  buildPdf(payload: QuotePdfPayload): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 0,
        size: 'A4',
        info: {
          Title: `Presupuesto ${formatQuoteNumber(payload.number)}`,
          Author: QUOTE_COMPANY.name,
          Subject: 'Presupuesto de venta',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const marginX = 42;
      const contentWidth = pageWidth - marginX * 2;
      const money = (n: number) =>
        n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

      // ── Header ────────────────────────────────────────────────────────────
      const headerH = 96;
      doc.rect(0, 0, pageWidth, headerH).fill(COLORS.navy);
      doc.rect(0, headerH, pageWidth, 5).fill(COLORS.primary);

      const logoIcon = this.loadLogoIcon();
      const brandX = marginX;
      const brandY = 18;
      const logoSize = 62;
      if (logoIcon) {
        try {
          // El PNG trae canvas blanco: lo recortamos a círculo para que no se vea sobre el navy.
          this.drawCircularLogo(doc, logoIcon, brandX, brandY, logoSize);
        } catch (err) {
          this.logger.warn(`No se pudo incrustar el logo: ${String(err)}`);
          this.drawSgBadge(doc, brandX, brandY + 2, logoSize - 4);
        }
      } else {
        this.drawSgBadge(doc, brandX, brandY + 2, logoSize - 4);
      }

      const titleX = brandX + logoSize + 14;
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(22);
      doc.text(QUOTE_COMPANY.name, titleX, brandY + 10, { width: 220, lineBreak: false });
      doc.fillColor(COLORS.accent).font('Helvetica').fontSize(9);
      doc.text('SERVICIO DE LIMPIEZA', titleX, brandY + 38, { width: 220, lineBreak: false });

      // Bloque derecho del header (sin solaparse con la marca)
      const rightW = 200;
      const rightX = pageWidth - marginX - rightW;
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(12);
      doc.text('PRESUPUESTO DE VENTA', rightX, brandY + 6, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
      doc.fillColor(COLORS.accent).font('Helvetica').fontSize(10);
      doc.text(`N° ${formatQuoteNumber(payload.number)}`, rightX, brandY + 26, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
      doc.fillColor(COLORS.white).fontSize(9);
      doc.text(`Fecha: ${payload.requestDate}`, rightX, brandY + 42, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
      if (payload.validUntil) {
        doc.fillColor('#cbd5e1').fontSize(8);
        doc.text(`Válido hasta: ${payload.validUntil}`, rightX, brandY + 56, {
          width: rightW,
          align: 'right',
          lineBreak: false,
        });
      }

      // ── Company strip ─────────────────────────────────────────────────────
      let y = headerH + 16;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
      doc.text(
        `${QUOTE_COMPANY.address}  ·  Tel: ${QUOTE_COMPANY.phone}  ·  ${QUOTE_COMPANY.website}`,
        marginX,
        y,
        { width: contentWidth },
      );
      y += 12;
      doc.text(`${QUOTE_COMPANY.taxStatus}  ·  CUIT ${QUOTE_COMPANY.taxId}`, marginX, y, {
        width: contentWidth,
      });
      y += 18;

      // ── Client card (altura dinámica) ─────────────────────────────────────
      const leftFacts: Array<[string, string]> = [];
      const rightFacts: Array<[string, string]> = [];
      if (payload.clientTaxId) leftFacts.push(['CUIT', payload.clientTaxId]);
      if (payload.clientAddress) leftFacts.push(['Domicilio', payload.clientAddress]);
      if (payload.clientContact) leftFacts.push(['Contacto', payload.clientContact]);
      if (payload.clientEmail) rightFacts.push(['Correo', payload.clientEmail]);
      if (payload.clientPhone) rightFacts.push(['Tel', payload.clientPhone]);
      if (payload.paymentCondition) rightFacts.push(['Condición', payload.paymentCondition]);
      if (payload.sellerName) rightFacts.push(['Vendedor', payload.sellerName]);

      const factRows = Math.max(leftFacts.length, rightFacts.length, 1);
      const clientBoxH = 52 + factRows * 14;
      doc.roundedRect(marginX, y, contentWidth, clientBoxH, 6).fill(COLORS.surface);
      doc
        .roundedRect(marginX, y, contentWidth, clientBoxH, 6)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();
      doc.rect(marginX, y, 4, clientBoxH).fill(COLORS.primary);

      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9);
      doc.text('DATOS DEL CLIENTE', marginX + 16, y + 12);
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(13);
      doc.text(payload.clientName, marginX + 16, y + 28, {
        width: contentWidth - 32,
        lineBreak: false,
      });

      const leftCol = marginX + 16;
      const rightCol = marginX + contentWidth / 2 + 8;
      const factsTop = y + 48;
      doc.font('Helvetica').fontSize(9);
      leftFacts.forEach(([label, value], i) => {
        this.drawLabeledValue(doc, label, value, leftCol, factsTop + i * 14, contentWidth / 2 - 28);
      });
      rightFacts.forEach(([label, value], i) => {
        this.drawLabeledValue(doc, label, value, rightCol, factsTop + i * 14, contentWidth / 2 - 28);
      });
      y += clientBoxH + 18;

      // ── Service type ──────────────────────────────────────────────────────
      if (payload.serviceType) {
        doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9);
        doc.text('TIPO DE SERVICIO', marginX, y);
        y += 14;
        doc.fillColor(COLORS.text).font('Helvetica').fontSize(10);
        doc.text(payload.serviceType, marginX, y, { width: contentWidth });
        y += doc.heightOfString(payload.serviceType, { width: contentWidth }) + 14;
      }

      // ── Items table ───────────────────────────────────────────────────────
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9);
      doc.text('DETALLE DEL PRESUPUESTO', marginX, y);
      y += 14;

      const cols = {
        cant: { x: marginX, w: 42 },
        desc: { x: marginX + 46, w: 0 },
        price: { x: 0, w: 78 },
        bonif: { x: 0, w: 52 },
        total: { x: 0, w: 82 },
      };
      cols.total.x = marginX + contentWidth - cols.total.w;
      cols.bonif.x = cols.total.x - cols.bonif.w - 6;
      cols.price.x = cols.bonif.x - cols.price.w - 6;
      cols.desc.w = cols.price.x - cols.desc.x - 6;

      const headerHRow = 22;
      doc.roundedRect(marginX, y, contentWidth, headerHRow, 3).fill(COLORS.primary);
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8);
      const headerTextY = y + 7;
      doc.text('CANT.', cols.cant.x + 4, headerTextY, { width: cols.cant.w - 4 });
      doc.text('DESCRIPCIÓN', cols.desc.x, headerTextY, { width: cols.desc.w });
      doc.text('PRECIO', cols.price.x, headerTextY, { width: cols.price.w, align: 'right' });
      doc.text('% BONIF.', cols.bonif.x, headerTextY, { width: cols.bonif.w, align: 'right' });
      doc.text('TOTAL', cols.total.x, headerTextY, { width: cols.total.w - 4, align: 'right' });
      y += headerHRow;

      doc.font('Helvetica').fontSize(8);
      for (let i = 0; i < payload.items.length; i++) {
        const item = payload.items[i];
        const descHeight = doc.heightOfString(item.description, { width: cols.desc.w });
        const rowH = Math.max(22, descHeight + 10);

        if (y + rowH > pageHeight - 200) {
          doc.addPage();
          y = 48;
        }

        if (i % 2 === 0) {
          doc.rect(marginX, y, contentWidth, rowH).fill(COLORS.rowAlt);
        }

        const textY = y + 6;
        doc.fillColor(COLORS.text);
        doc.text(String(item.quantity), cols.cant.x + 4, textY, { width: cols.cant.w - 4 });
        doc.text(item.description, cols.desc.x, textY, { width: cols.desc.w });
        doc.text(money(item.unitPrice), cols.price.x, textY, {
          width: cols.price.w,
          align: 'right',
        });
        doc.text(
          item.discountPercent != null && item.discountPercent > 0
            ? `${item.discountPercent}%`
            : '—',
          cols.bonif.x,
          textY,
          { width: cols.bonif.w, align: 'right' },
        );
        doc.font('Helvetica-Bold').text(money(item.lineTotal), cols.total.x, textY, {
          width: cols.total.w - 4,
          align: 'right',
        });
        doc.font('Helvetica');
        y += rowH;
      }

      doc
        .moveTo(marginX, y)
        .lineTo(marginX + contentWidth, y)
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .stroke();

      // ── Totals ────────────────────────────────────────────────────────────
      y += 14;
      const totalsW = 220;
      const totalsX = marginX + contentWidth - totalsW;
      const totalsH = 78;
      if (y + totalsH > pageHeight - 160) {
        doc.addPage();
        y = 48;
      }

      doc.roundedRect(totalsX, y, totalsW, totalsH, 6).fill(COLORS.surface);
      doc.roundedRect(totalsX, y, totalsW, totalsH, 6).strokeColor(COLORS.border).stroke();

      const totalsInner = totalsX + 14;
      const totalsValueW = totalsW - 28;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9);
      doc.text('Sub-Total', totalsInner, y + 12);
      doc.fillColor(COLORS.text).text(money(payload.subtotal), totalsInner, y + 12, {
        width: totalsValueW,
        align: 'right',
      });
      doc.fillColor(COLORS.muted).text(`I.V.A. (${payload.vatRate}%)`, totalsInner, y + 28);
      doc.fillColor(COLORS.text).text(money(payload.vatAmount), totalsInner, y + 28, {
        width: totalsValueW,
        align: 'right',
      });
      doc
        .moveTo(totalsInner, y + 46)
        .lineTo(totalsX + totalsW - 14, y + 46)
        .strokeColor(COLORS.border)
        .stroke();
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11);
      doc.text('TOTAL', totalsInner, y + 54);
      doc.fillColor(COLORS.primaryDark).text(money(payload.total), totalsInner, y + 54, {
        width: totalsValueW,
        align: 'right',
      });

      // ── Terms ─────────────────────────────────────────────────────────────
      y += totalsH + 22;
      if (y > pageHeight - 150) {
        doc.addPage();
        y = 48;
      }

      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9);
      doc.text('CONDICIONES', marginX, y);
      y += 14;
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(9);
      const observations =
        payload.observations?.trim() || 'ESTE PRESUPUESTO ES VALIDO POR UN MES';
      const paymentTerms =
        payload.paymentTerms?.trim() ||
        '50% DE ANTICIPO EL RESTO A FINALIZAR EL SERVICIO';
      doc.text(`Observaciones: ${observations}`, marginX, y, { width: contentWidth });
      y += doc.heightOfString(`Observaciones: ${observations}`, { width: contentWidth }) + 8;
      doc.text(`Forma de pago: ${paymentTerms}`, marginX, y, { width: contentWidth });
      y += doc.heightOfString(`Forma de pago: ${paymentTerms}`, { width: contentWidth }) + 14;

      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9);
      doc.text('EL SERVICIO INCLUYE', marginX, y);
      y += 14;
      doc.font('Helvetica').fontSize(9);
      const includes = [
        'Insumos requeridos para el servicio',
        'Indumentaria',
        'Todos los seguros correspondientes del operario',
      ];
      for (const item of includes) {
        // Viñeta y texto en columnas fijas (evita continued/solapamiento de PDFKit).
        doc.fillColor(COLORS.primary).text('•', marginX, y, { width: 12, lineBreak: false });
        doc.fillColor(COLORS.text).text(item, marginX + 14, y, {
          width: contentWidth - 14,
          lineBreak: false,
        });
        y += 15;
      }

      // ── Footer ────────────────────────────────────────────────────────────
      const footerY = pageHeight - 36;
      doc.rect(0, footerY - 10, pageWidth, 46).fill(COLORS.navy);
      doc.fillColor(COLORS.accent).font('Helvetica').fontSize(8);
      doc.text('*** DOCUMENTO SIN VALOR FISCAL ***', marginX, footerY, {
        width: contentWidth,
        align: 'center',
      });
      doc.fillColor('#94a3b8').fontSize(7);
      doc.text(
        `${QUOTE_COMPANY.name} · ${QUOTE_COMPANY.website} · Estado: ${payload.statusLabel}`,
        marginX,
        footerY + 12,
        { width: contentWidth, align: 'center' },
      );

      doc.end();
    });
  }

  private drawLabeledValue(
    doc: PdfDoc,
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
  ) {
    doc.fillColor(COLORS.muted).text(`${label}: ${value}`, x, y, {
      width,
      lineBreak: false,
      ellipsis: true,
    });
  }

  private drawCircularLogo(doc: PdfDoc, logo: Buffer, x: number, y: number, size: number) {
    const r = size / 2;
    const cx = x + r;
    const cy = y + r;
    doc.save();
    doc.circle(cx, cy, r).clip();
    doc.image(logo, x, y, { width: size, height: size });
    doc.restore();
  }

  private drawSgBadge(doc: PdfDoc, x: number, y: number, size: number) {
    const r = size / 2;
    doc.fillColor(COLORS.primary);
    doc.circle(x + r, y + r, r).fill();
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(size * 0.34);
    doc.text('SG', x, y + size * 0.32, { width: size, align: 'center', lineBreak: false });
  }

  private loadLogoIcon(): Buffer | null {
    const candidates = [
      join(__dirname, '../../../assets/brand/logo-icon.png'),
      join(process.cwd(), 'apps/api/assets/brand/logo-icon.png'),
      join(process.cwd(), 'assets/brand/logo-icon.png'),
      join(process.cwd(), 'apps/mobile/assets/images/logo-sinletras.png'),
      // Fallbacks: si solo hay logo completo, se usa igual (ya no se redibuja tipografía encima).
      join(__dirname, '../../../assets/brand/logo.png'),
      join(process.cwd(), 'apps/api/assets/brand/logo.png'),
      join(process.cwd(), 'apps/web/public/logo-fondoblanco-sinfondo.png'),
    ];

    for (const path of candidates) {
      if (!existsSync(path)) continue;
      try {
        return readFileSync(path);
      } catch {
        // try next
      }
    }

    this.logger.warn('Logo de marca no encontrado; se usará badge tipográfico.');
    return null;
  }
}
