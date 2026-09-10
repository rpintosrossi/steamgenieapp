import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { QUOTE_COMPANY } from '@steam-genie/shared-constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

const COLORS = {
  navy: '#0a1628',
  primary: '#2f6fed',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  surface: '#f8fafc',
  white: '#ffffff',
  rowAlt: '#f1f5f9',
  success: '#15803d',
};

const PHASE_LABELS: Record<string, string> = {
  BEFORE: 'Antes',
  DURING: 'Durante',
  AFTER: 'Después',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  DONE: 'Realizada',
  NOT_DONE: 'No realizada',
  SKIPPED: 'Omitida',
};

export type ServiceReportPhoto = {
  buffer: Buffer;
  caption: string;
  phase?: 'BEFORE' | 'DURING' | 'AFTER';
};

export type ServiceReportTask = {
  name: string;
  status: string | null;
  executedByName: string | null;
  executedAtLabel: string | null;
  observation: string | null;
  photos: ServiceReportPhoto[];
};

export type ServiceReportPdfPayload = {
  title: string;
  reportDateLabel: string;
  serviceDateLabel: string;
  startedAtLabel: string | null;
  completedAtLabel: string | null;
  clientName: string;
  locationLabel: string;
  workersLabel: string;
  photoMode: 'PER_TASK' | 'BEFORE_DURING_AFTER';
  phasePhotos: ServiceReportPhoto[];
  tasks: ServiceReportTask[];
};

type PdfDoc = InstanceType<typeof PDFDocument>;

@Injectable()
export class ServiceReportPdfService {
  private readonly logger = new Logger(ServiceReportPdfService.name);

  buildPdf(payload: ServiceReportPdfPayload): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 0,
        size: 'A4',
        info: {
          Title: `Resumen de servicio — ${payload.clientName}`,
          Author: QUOTE_COMPANY.name,
          Subject: 'Resumen de servicio de limpieza',
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
      const bottomLimit = pageHeight - 56;

      const ensureSpace = (needed: number) => {
        if (doc.y + needed <= bottomLimit) return;
        this.drawFooter(doc, pageWidth, pageHeight, marginX, contentWidth);
        doc.addPage();
        doc.y = 48;
      };

      // ── Header ────────────────────────────────────────────────────────────
      const headerH = 96;
      doc.rect(0, 0, pageWidth, headerH).fill(COLORS.white);
      doc.rect(0, headerH, pageWidth, 5).fill(COLORS.primary);

      const brandX = marginX;
      const brandY = 16;
      const logo = this.loadBrandLogo();
      if (logo) {
        try {
          doc.image(logo.buffer, brandX, brandY, { height: 64 });
        } catch (err) {
          this.logger.warn(`No se pudo incrustar el logo: ${String(err)}`);
          this.drawBrandFallback(doc, brandX, brandY);
        }
      } else {
        this.drawBrandFallback(doc, brandX, brandY);
      }

      const rightW = 230;
      const rightX = pageWidth - marginX - rightW;
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(12);
      doc.text('RESUMEN DE SERVICIO', rightX, brandY + 10, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(9);
      doc.text(`Fecha: ${payload.reportDateLabel}`, rightX, brandY + 32, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });

      // ── Company strip ─────────────────────────────────────────────────────
      let y = headerH + 16;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
      doc.text(
        `${QUOTE_COMPANY.address}  ·  Tel: ${QUOTE_COMPANY.phone}  ·  ${QUOTE_COMPANY.website}`,
        marginX,
        y,
        { width: contentWidth },
      );
      y += 20;

      // ── Client card ───────────────────────────────────────────────────────
      const clientBoxH = 72;
      doc.roundedRect(marginX, y, contentWidth, clientBoxH, 6).fill(COLORS.surface);
      doc
        .roundedRect(marginX, y, contentWidth, clientBoxH, 6)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();
      doc.rect(marginX, y, 4, clientBoxH).fill(COLORS.primary);

      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9);
      doc.text('CLIENTE', marginX + 16, y + 12);
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(14);
      doc.text(payload.clientName, marginX + 16, y + 28, {
        width: contentWidth - 32,
        lineBreak: false,
      });
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9);
      doc.text(payload.locationLabel, marginX + 16, y + 48, {
        width: contentWidth - 32,
        lineBreak: false,
        ellipsis: true,
      });
      y += clientBoxH + 16;

      // ── Service meta ──────────────────────────────────────────────────────
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11);
      doc.text(payload.title, marginX, y, { width: contentWidth });
      y += doc.heightOfString(payload.title, { width: contentWidth }) + 10;

      const metaPairs: Array<[string, string]> = [
        ['Fecha del servicio', payload.serviceDateLabel],
      ];
      if (payload.startedAtLabel) metaPairs.push(['Inicio', payload.startedAtLabel]);
      if (payload.completedAtLabel) metaPairs.push(['Finalización', payload.completedAtLabel]);
      if (payload.workersLabel) metaPairs.push(['Personal', payload.workersLabel]);

      for (const [label, value] of metaPairs) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
        doc.text(label.toUpperCase(), marginX, y);
        doc.fillColor(COLORS.text).font('Helvetica').fontSize(10);
        doc.text(value, marginX + 120, y - 1, { width: contentWidth - 120 });
        y += 16;
      }
      y += 8;

      // ── Tasks (checklist del servicio / ítems del presupuesto) ──────────────
      doc.y = y;
      ensureSpace(40);
      y = doc.y;
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11);
      doc.text('TAREAS DEL SERVICIO', marginX, y, { lineBreak: false });
      doc.y = y + 16;

      if (payload.tasks.length === 0) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10);
        doc.text('No hay tareas definidas para este servicio.', marginX, doc.y, {
          lineBreak: false,
        });
        doc.y += 18;
      } else {
        payload.tasks.forEach((task, index) => {
          const title = `${index + 1}. ${task.name}`;
          const innerW = contentWidth - 24;
          const hasExecutionMeta = Boolean(
            task.status || task.executedByName || task.executedAtLabel,
          );
          const obsText = task.observation
            ? `Observación: ${task.observation}`
            : null;

          const padY = 10;
          const gap = 6;
          doc.font('Helvetica-Bold').fontSize(10);
          const titleH = doc.heightOfString(title, { width: innerW });
          const metaH = hasExecutionMeta ? 12 : 0;
          let obsH = 0;
          if (obsText) {
            doc.font('Helvetica').fontSize(9);
            obsH = doc.heightOfString(obsText, { width: innerW });
          }
          const blockH =
            padY +
            titleH +
            (hasExecutionMeta ? gap + metaH : 0) +
            (obsText ? gap + obsH : 0) +
            padY;

          ensureSpace(blockH + 8);
          y = doc.y;

          const bg = index % 2 === 0 ? COLORS.surface : COLORS.white;
          doc.roundedRect(marginX, y, contentWidth, blockH, 4).fill(bg);
          doc
            .roundedRect(marginX, y, contentWidth, blockH, 4)
            .lineWidth(0.5)
            .strokeColor(COLORS.border)
            .stroke();

          let cursorY = y + padY;
          doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10);
          doc.text(title, marginX + 12, cursorY, { width: innerW });
          cursorY += titleH;

          if (hasExecutionMeta) {
            cursorY += gap;
            const statusLabel = task.status
              ? (TASK_STATUS_LABELS[task.status] ?? task.status)
              : 'Pendiente';
            const statusColor = task.status === 'DONE' ? COLORS.success : COLORS.muted;
            const statusW = 90;
            doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(8);
            doc.text(statusLabel, marginX + 12, cursorY, {
              width: statusW,
              height: metaH,
              ellipsis: true,
            });

            const who = task.executedByName ?? '—';
            const when = task.executedAtLabel ?? '—';
            doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
            doc.text(`${who}  ·  ${when}`, marginX + 12 + statusW, cursorY, {
              width: innerW - statusW,
              height: metaH,
              ellipsis: true,
            });
            cursorY += metaH;
          }

          if (obsText) {
            cursorY += gap;
            doc.fillColor(COLORS.text).font('Helvetica').fontSize(9);
            doc.text(obsText, marginX + 12, cursorY, { width: innerW });
          }

          doc.y = y + blockH + 8;
        });
      }

      // ── Photos ────────────────────────────────────────────────────────────
      ensureSpace(40);
      y = doc.y + 8;
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11);
      doc.text('EVIDENCIA FOTOGRÁFICA', marginX, y, { lineBreak: false });
      y += 16;
      doc.y = y;

      if (payload.photoMode === 'BEFORE_DURING_AFTER') {
        if (payload.phasePhotos.length === 0) {
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10);
          doc.text('Sin fotos de fase registradas.', marginX, doc.y);
        } else {
          for (const phase of ['BEFORE', 'DURING', 'AFTER'] as const) {
            const items = payload.phasePhotos.filter((p) => p.phase === phase);
            if (items.length === 0) continue;
            ensureSpace(28);
            doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9);
            doc.text(PHASE_LABELS[phase] ?? phase, marginX, doc.y);
            doc.y += 12;
            this.drawPhotoGrid(doc, items, marginX, contentWidth, ensureSpace);
          }
        }
      } else {
        const tasksWithPhotos = payload.tasks.filter((t) => t.photos.length > 0);
        if (tasksWithPhotos.length === 0) {
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10);
          doc.text('Sin fotos registradas.', marginX, doc.y);
        } else {
          for (const task of tasksWithPhotos) {
            doc.font('Helvetica-Bold').fontSize(9);
            const nameH = doc.heightOfString(task.name, { width: contentWidth });
            ensureSpace(nameH + 16);
            const nameY = doc.y;
            doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9);
            doc.text(task.name, marginX, nameY, { width: contentWidth });
            doc.y = nameY + nameH + 8;
            this.drawPhotoGrid(doc, task.photos, marginX, contentWidth, ensureSpace);
          }
        }
      }

      this.drawFooter(doc, pageWidth, pageHeight, marginX, contentWidth);
      doc.end();
    });
  }

  private drawPhotoGrid(
    doc: PdfDoc,
    photos: ServiceReportPhoto[],
    marginX: number,
    contentWidth: number,
    ensureSpace: (needed: number) => void,
  ) {
    const gap = 14;
    const cols = 1;
    const cellW = contentWidth;
    const cellH = 320;
    const captionH = 20;
    const rowH = cellH + captionH + gap;

    let col = 0;
    for (const photo of photos) {
      if (col === 0) ensureSpace(rowH);
      const x = marginX + col * (cellW + gap);
      const y = doc.y;

      doc.roundedRect(x, y, cellW, cellH, 4).fill(COLORS.surface);
      doc
        .roundedRect(x, y, cellW, cellH, 4)
        .lineWidth(0.5)
        .strokeColor(COLORS.border)
        .stroke();

      try {
        doc.image(photo.buffer, x + 4, y + 4, {
          fit: [cellW - 8, cellH - 8],
          align: 'center',
          valign: 'center',
        });
      } catch (err) {
        this.logger.warn(`No se pudo incrustar foto: ${String(err)}`);
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
        doc.text('Foto no disponible', x + 8, y + cellH / 2 - 6, {
          width: cellW - 16,
          align: 'center',
        });
      }

      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
      doc.text(photo.caption, x, y + cellH + 4, {
        width: cellW,
        height: captionH,
        align: 'center',
        ellipsis: true,
      });

      col += 1;
      if (col >= cols) {
        col = 0;
        doc.y = y + rowH;
      }
    }

    if (col !== 0) {
      doc.y += rowH;
    }
    doc.y += 6;
  }

  private drawFooter(
    doc: PdfDoc,
    pageWidth: number,
    pageHeight: number,
    marginX: number,
    contentWidth: number,
  ) {
    const y = pageHeight - 36;
    doc
      .moveTo(marginX, y)
      .lineTo(marginX + contentWidth, y)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7);
    doc.text(
      `${QUOTE_COMPANY.name} · ${QUOTE_COMPANY.website} · Documento de evidencia de servicio`,
      marginX,
      y + 8,
      { width: contentWidth, align: 'center' },
    );
  }

  private drawBrandFallback(doc: PdfDoc, x: number, y: number) {
    const size = 56;
    const r = size / 2;
    doc.fillColor(COLORS.primary);
    doc.circle(x + r, y + r, r).fill();
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(size * 0.28);
    doc.text('SG', x, y + size * 0.34, { width: size, align: 'center', lineBreak: false });
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(18);
    doc.text(QUOTE_COMPANY.name, x + size + 12, y + 12, { lineBreak: false });
    doc.fillColor(COLORS.primary).font('Helvetica').fontSize(8);
    doc.text('SERVICIO DE LIMPIEZA', x + size + 12, y + 36, { lineBreak: false });
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

    for (const logoPath of candidates) {
      if (!existsSync(logoPath)) continue;
      try {
        return { buffer: readFileSync(logoPath) };
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
