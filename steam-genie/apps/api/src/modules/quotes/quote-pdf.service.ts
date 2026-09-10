import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { QUOTE_COMPANY, formatQuoteNumber, parseQuoteServiceIncludes } from '@steam-genie/shared-constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

/** Colores de marca Steam Genie (alineados al panel web). */
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
  companyBranchName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  paymentCondition: string | null;
  paymentTerms: string | null;
  observations: string | null;
  serviceIncludes: string | null;
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

type Density = {
  headerH: number;
  logoH: number;
  brandY: number;
  companyGap: number;
  sectionGap: number;
  clientPad: number;
  clientFactH: number;
  clientNameSize: number;
  sectionTitleSize: number;
  bodySize: number;
  tableFont: number;
  tableHeaderH: number;
  rowPad: number;
  minRowH: number;
  totalsH: number;
  includeGap: number;
  includeLineGap: number;
  maxDescChars: number;
  footerReserve: number;
};

const DENSITY_NORMAL: Density = {
  headerH: 88,
  logoH: 56,
  brandY: 14,
  companyGap: 14,
  sectionGap: 14,
  clientPad: 44,
  clientFactH: 13,
  clientNameSize: 12,
  sectionTitleSize: 8,
  bodySize: 9,
  tableFont: 8,
  tableHeaderH: 20,
  rowPad: 8,
  minRowH: 18,
  totalsH: 70,
  includeGap: 4,
  includeLineGap: 1,
  maxDescChars: 900,
  footerReserve: 44,
};

const DENSITY_COMPACT: Density = {
  headerH: 64,
  logoH: 40,
  brandY: 10,
  companyGap: 8,
  sectionGap: 8,
  clientPad: 36,
  clientFactH: 11,
  clientNameSize: 10,
  sectionTitleSize: 7,
  bodySize: 7.5,
  tableFont: 7,
  tableHeaderH: 16,
  rowPad: 4,
  minRowH: 14,
  totalsH: 58,
  includeGap: 2,
  includeLineGap: 0,
  maxDescChars: 280,
  footerReserve: 36,
};

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
      const marginX = 36;
      const contentWidth = pageWidth - marginX * 2;
      const money = (n: number) =>
        n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

      const density = this.chooseDensity(doc, payload, contentWidth, pageHeight);
      const items = payload.items.map((item) => ({
        ...item,
        description: this.clipText(item.description, density.maxDescChars),
      }));

      // ── Header ────────────────────────────────────────────────────────────
      const headerH = density.headerH;
      doc.rect(0, 0, pageWidth, headerH).fill(COLORS.white);
      doc.rect(0, headerH, pageWidth, 4).fill(COLORS.primary);

      const brandX = marginX;
      const brandY = density.brandY;
      const logo = this.loadBrandLogo();
      if (logo) {
        try {
          doc.image(logo.buffer, brandX, brandY, { height: density.logoH });
        } catch (err) {
          this.logger.warn(`No se pudo incrustar el logo: ${String(err)}`);
          this.drawBrandFallback(doc, brandX, brandY, density.logoH);
        }
      } else {
        this.drawBrandFallback(doc, brandX, brandY, density.logoH);
      }

      const rightW = 210;
      const rightX = pageWidth - marginX - rightW;
      const titleSize = density === DENSITY_COMPACT ? 10 : 12;
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(titleSize);
      doc.text('PRESUPUESTO DE VENTA', rightX, brandY + 4, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(density === DENSITY_COMPACT ? 9 : 10);
      doc.text(`N° ${formatQuoteNumber(payload.number)}`, rightX, brandY + 20, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
      doc.fillColor(COLORS.text).fontSize(density === DENSITY_COMPACT ? 8 : 9);
      doc.text(`Fecha: ${payload.requestDate}`, rightX, brandY + 34, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
      if (payload.validUntil) {
        doc.fillColor(COLORS.muted).fontSize(7);
        doc.text(`Válido hasta: ${payload.validUntil}`, rightX, brandY + 46, {
          width: rightW,
          align: 'right',
          lineBreak: false,
        });
      }

      // ── Company strip ─────────────────────────────────────────────────────
      let y = headerH + (density === DENSITY_COMPACT ? 8 : 12);
      const companyBranchName = payload.companyBranchName?.trim() || '';
      const companyAddress = payload.companyAddress?.trim() || QUOTE_COMPANY.address;
      const companyPhone = payload.companyPhone?.trim() || QUOTE_COMPANY.phone;
      const companyLine = [
        companyBranchName,
        companyAddress,
        `Tel: ${companyPhone}`,
        QUOTE_COMPANY.website,
      ]
        .filter(Boolean)
        .join('  ·  ');
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7);
      doc.text(companyLine, marginX, y, { width: contentWidth });
      y += 10;
      doc.text(`${QUOTE_COMPANY.taxStatus}  ·  CUIT ${QUOTE_COMPANY.taxId}`, marginX, y, {
        width: contentWidth,
      });
      y += density.companyGap;

      // ── Client card ───────────────────────────────────────────────────────
      const leftFacts: Array<[string, string]> = [];
      const rightFacts: Array<[string, string]> = [];
      const clientTaxId = payload.clientTaxId?.trim() || '';
      if (clientTaxId) leftFacts.push(['CUIT', clientTaxId]);
      if (payload.clientAddress) leftFacts.push(['Domicilio', payload.clientAddress]);
      if (payload.clientContact) leftFacts.push(['Contacto', payload.clientContact]);
      if (payload.clientEmail) leftFacts.push(['Correo', payload.clientEmail]);
      if (payload.clientPhone) leftFacts.push(['Tel', payload.clientPhone]);
      if (payload.sellerName) rightFacts.push(['Vendedor', payload.sellerName]);
      if (payload.paymentCondition) rightFacts.push(['Condición', payload.paymentCondition]);

      const factRows = Math.max(leftFacts.length, rightFacts.length, 1);
      const clientBoxH = density.clientPad + factRows * density.clientFactH;
      doc.roundedRect(marginX, y, contentWidth, clientBoxH, 5).fill(COLORS.surface);
      doc
        .roundedRect(marginX, y, contentWidth, clientBoxH, 5)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();
      doc.rect(marginX, y, 3, clientBoxH).fill(COLORS.primary);

      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8);
      doc.text('DATOS DEL CLIENTE', marginX + 14, y + 8);
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(density.clientNameSize);
      doc.text(payload.clientName, marginX + 14, y + 22, {
        width: contentWidth - 28,
        lineBreak: false,
      });

      const leftCol = marginX + 14;
      const rightCol = marginX + contentWidth / 2 + 6;
      const factsTop = y + density.clientPad - 4;
      doc.font('Helvetica').fontSize(density.bodySize - 0.5);
      leftFacts.forEach(([label, value], i) => {
        this.drawLabeledValue(
          doc,
          label,
          value,
          leftCol,
          factsTop + i * density.clientFactH,
          contentWidth / 2 - 26,
        );
      });
      rightFacts.forEach(([label, value], i) => {
        this.drawLabeledValue(
          doc,
          label,
          value,
          rightCol,
          factsTop + i * density.clientFactH,
          contentWidth / 2 - 26,
        );
      });
      y += clientBoxH + density.sectionGap;

      // ── Service type ──────────────────────────────────────────────────────
      if (payload.serviceType) {
        doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(density.sectionTitleSize);
        doc.text('TIPO DE SERVICIO', marginX, y);
        y += 11;
        doc.fillColor(COLORS.text).font('Helvetica').fontSize(density.bodySize);
        const serviceText = this.clipText(payload.serviceType, density.maxDescChars);
        doc.text(serviceText, marginX, y, { width: contentWidth });
        y += doc.heightOfString(serviceText, { width: contentWidth }) + density.sectionGap;
      }

      // ── Items table ───────────────────────────────────────────────────────
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(density.sectionTitleSize);
      doc.text('DETALLE DEL PRESUPUESTO', marginX, y);
      y += 11;

      const cols = {
        cant: { x: marginX, w: 36 },
        desc: { x: marginX + 40, w: 0 },
        price: { x: 0, w: 72 },
        bonif: { x: 0, w: 46 },
        total: { x: 0, w: 76 },
      };
      cols.total.x = marginX + contentWidth - cols.total.w;
      cols.bonif.x = cols.total.x - cols.bonif.w - 4;
      cols.price.x = cols.bonif.x - cols.price.w - 4;
      cols.desc.w = cols.price.x - cols.desc.x - 4;

      const headerHRow = density.tableHeaderH;
      doc.roundedRect(marginX, y, contentWidth, headerHRow, 3).fill(COLORS.primary);
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(density.tableFont);
      const headerTextY = y + (headerHRow - density.tableFont) / 2 - 1;
      doc.text('CANT.', cols.cant.x + 3, headerTextY, { width: cols.cant.w - 3 });
      doc.text('DESCRIPCIÓN', cols.desc.x, headerTextY, { width: cols.desc.w });
      doc.text('PRECIO', cols.price.x, headerTextY, { width: cols.price.w, align: 'right' });
      doc.text('% BONIF.', cols.bonif.x, headerTextY, { width: cols.bonif.w, align: 'right' });
      doc.text('TOTAL', cols.total.x, headerTextY, { width: cols.total.w - 3, align: 'right' });
      y += headerHRow;

      const bottomLimit = pageHeight - density.footerReserve - 8;
      doc.font('Helvetica').fontSize(density.tableFont);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const descHeight = doc.heightOfString(item.description, { width: cols.desc.w });
        const rowH = Math.max(density.minRowH, descHeight + density.rowPad);

        // Sin saltar de página: si no entra, se dibuja igual (preferimos 1 hoja).
        if (i % 2 === 0) {
          doc.rect(marginX, y, contentWidth, rowH).fill(COLORS.rowAlt);
        }

        const textY = y + Math.max(2, density.rowPad / 2);
        doc.fillColor(COLORS.text);
        doc.text(String(item.quantity), cols.cant.x + 3, textY, { width: cols.cant.w - 3 });
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
          width: cols.total.w - 3,
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
      y += density === DENSITY_COMPACT ? 8 : 12;
      const totalsW = 200;
      const totalsX = marginX + contentWidth - totalsW;
      const totalsH = density.totalsH;

      doc.roundedRect(totalsX, y, totalsW, totalsH, 5).fill(COLORS.surface);
      doc.roundedRect(totalsX, y, totalsW, totalsH, 5).strokeColor(COLORS.border).stroke();

      const totalsInner = totalsX + 12;
      const totalsValueW = totalsW - 24;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(density.bodySize);
      doc.text('Sub-Total', totalsInner, y + 10);
      doc.fillColor(COLORS.text).text(money(payload.subtotal), totalsInner, y + 10, {
        width: totalsValueW,
        align: 'right',
      });
      doc.fillColor(COLORS.muted).text(
        payload.vatRate === 0 ? 'Bonif. I.V.A.' : `I.V.A. (${payload.vatRate}%)`,
        totalsInner,
        y + 24,
      );
      doc.fillColor(COLORS.text).text(money(payload.vatAmount), totalsInner, y + 24, {
        width: totalsValueW,
        align: 'right',
      });
      doc
        .moveTo(totalsInner, y + 38)
        .lineTo(totalsX + totalsW - 12, y + 38)
        .strokeColor(COLORS.border)
        .stroke();
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(density.bodySize + 1);
      doc.text('TOTAL', totalsInner, y + totalsH - 18);
      doc.fillColor(COLORS.primaryDark).text(money(payload.total), totalsInner, y + totalsH - 18, {
        width: totalsValueW,
        align: 'right',
      });

      // ── Terms ─────────────────────────────────────────────────────────────
      y += totalsH + density.sectionGap;

      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(density.sectionTitleSize);
      doc.text('CONDICIONES', marginX, y);
      y += 11;
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(density.bodySize);
      const observations = this.clipText(
        payload.observations?.trim() || 'ESTE PRESUPUESTO ES VALIDO POR UN MES',
        density === DENSITY_COMPACT ? 220 : 500,
      );
      const paymentTerms = this.clipText(
        payload.paymentTerms?.trim() ||
          '50% DE ANTICIPO EL RESTO A FINALIZAR EL SERVICIO',
        density === DENSITY_COMPACT ? 220 : 500,
      );
      doc.text(`Observaciones: ${observations}`, marginX, y, { width: contentWidth });
      y +=
        doc.heightOfString(`Observaciones: ${observations}`, { width: contentWidth }) +
        (density === DENSITY_COMPACT ? 4 : 6);
      doc.text(`Forma de pago: ${paymentTerms}`, marginX, y, { width: contentWidth });
      y +=
        doc.heightOfString(`Forma de pago: ${paymentTerms}`, { width: contentWidth }) +
        density.sectionGap;

      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(density.sectionTitleSize);
      doc.text('EL SERVICIO INCLUYE', marginX, y);
      y += 11;
      doc.font('Helvetica').fontSize(density.bodySize);
      const includes = parseQuoteServiceIncludes(payload.serviceIncludes);
      for (const item of includes) {
        if (y > bottomLimit - 12) break;
        const bulletX = marginX;
        const textX = marginX + 12;
        const textW = contentWidth - 12;
        const line = this.clipText(item, density === DENSITY_COMPACT ? 160 : 400);
        const h = Math.max(
          10,
          doc.heightOfString(line, { width: textW, lineGap: density.includeLineGap }),
        );
        doc.fillColor(COLORS.primary).text('•', bulletX, y, { width: 10, lineBreak: false });
        doc.fillColor(COLORS.text).text(line, textX, y, {
          width: textW,
          lineGap: density.includeLineGap,
        });
        y += h + density.includeGap;
      }

      // ── Footer (siempre en la primera hoja) ───────────────────────────────
      const footerY = pageHeight - density.footerReserve + 8;
      doc.rect(0, footerY - 8, pageWidth, density.footerReserve + 8).fill(COLORS.navy);
      doc.fillColor(COLORS.accent).font('Helvetica').fontSize(7);
      doc.text('*** DOCUMENTO SIN VALOR FISCAL ***', marginX, footerY, {
        width: contentWidth,
        align: 'center',
      });
      doc.fillColor('#94a3b8').fontSize(6.5);
      doc.text(
        `${QUOTE_COMPANY.name} · ${QUOTE_COMPANY.website} · Estado: ${payload.statusLabel}`,
        marginX,
        footerY + 11,
        { width: contentWidth, align: 'center' },
      );

      doc.end();
    });
  }

  /** Elige layout normal o compacto según si el contenido cabe en una hoja A4. */
  private chooseDensity(
    doc: PdfDoc,
    payload: QuotePdfPayload,
    contentWidth: number,
    pageHeight: number,
  ): Density {
    const estimate = (d: Density) => {
      const descW = contentWidth - 36 - 72 - 46 - 76 - 20;
      doc.font('Helvetica').fontSize(d.tableFont);
      let itemsH = d.tableHeaderH;
      for (const item of payload.items) {
        const desc = this.clipText(item.description, d.maxDescChars);
        const h = Math.max(
          d.minRowH,
          doc.heightOfString(desc, { width: Math.max(80, descW) }) + d.rowPad,
        );
        itemsH += h;
      }

      const includes = parseQuoteServiceIncludes(payload.serviceIncludes);
      doc.font('Helvetica').fontSize(d.bodySize);
      let includesH = 0;
      for (const line of includes) {
        const clipped = this.clipText(line, d === DENSITY_COMPACT ? 160 : 400);
        includesH +=
          Math.max(10, doc.heightOfString(clipped, { width: contentWidth - 12 })) + d.includeGap;
      }

      const leftFacts =
        [
          payload.clientTaxId?.trim(),
          payload.clientAddress,
          payload.clientContact,
          payload.clientEmail,
          payload.clientPhone,
        ].filter(Boolean).length || 1;
      const rightFacts =
        [payload.sellerName, payload.paymentCondition].filter(Boolean).length || 1;
      const clientH = d.clientPad + Math.max(leftFacts, rightFacts) * d.clientFactH;

      const serviceH = payload.serviceType
        ? 11 +
          doc.heightOfString(this.clipText(payload.serviceType, d.maxDescChars), {
            width: contentWidth,
          }) +
          d.sectionGap
        : 0;

      return (
        d.headerH +
        30 +
        clientH +
        d.sectionGap +
        serviceH +
        11 +
        itemsH +
        12 +
        d.totalsH +
        d.sectionGap +
        40 +
        includesH +
        d.footerReserve +
        24
      );
    };

    if (estimate(DENSITY_NORMAL) <= pageHeight) return DENSITY_NORMAL;
    return DENSITY_COMPACT;
  }

  private clipText(value: string, maxChars: number): string {
    const text = value.trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
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

  private drawBrandFallback(doc: PdfDoc, x: number, y: number, size = 56) {
    const r = size / 2;
    doc.fillColor(COLORS.primary);
    doc.circle(x + r, y + r, r).fill();
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(size * 0.28);
    doc.text('SG', x, y + size * 0.34, { width: size, align: 'center', lineBreak: false });
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(Math.max(12, size * 0.32));
    doc.text(QUOTE_COMPANY.name, x + size + 10, y + size * 0.2, { lineBreak: false });
    doc.fillColor(COLORS.primary).font('Helvetica').fontSize(7);
    doc.text('SERVICIO DE LIMPIEZA', x + size + 10, y + size * 0.55, { lineBreak: false });
  }

  private loadBrandLogo(): { buffer: Buffer } | null {
    const candidates = [
      join(process.cwd(), 'assets/brand/logo-horizontal.png'),
      join(__dirname, '../../../assets/brand/logo-horizontal.png'),
      join(__dirname, '../../assets/brand/logo-horizontal.png'),
      join(process.cwd(), 'apps/api/assets/brand/logo-horizontal.png'),
      join(process.cwd(), 'assets/brand/logo-wide.png'),
      join(__dirname, '../../../assets/brand/logo-wide.png'),
      join(__dirname, '../../assets/brand/logo-wide.png'),
      join(process.cwd(), 'apps/api/assets/brand/logo-wide.png'),
    ];

    for (const path of candidates) {
      if (!existsSync(path)) continue;
      try {
        return { buffer: readFileSync(path) };
      } catch {
        // try next
      }
    }

    this.logger.warn(
      `Logo de marca no encontrado (cwd=${process.cwd()}, __dirname=${__dirname}); se usará tipografía de respaldo.`,
    );
    return null;
  }
}
