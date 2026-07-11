import { Injectable } from '@nestjs/common';
import { StorageService } from '../../infrastructure/storage/storage.service';

// pdfkit es CommonJS; el default import se rompe al compilar a CJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

export type CommissionPdfPayload = {
  id: string;
  beneficiaryName: string;
  dateFrom: string;
  dateTo: string;
  percentage: number;
  totalClientCharged: number;
  totalServiceExpenses: number;
  totalFixedExpenses: number;
  netAmount: number;
  commissionAmount: number;
  version: number;
  createdAt: string;
  items: Array<{
    title: string;
    scheduledDate: string | null;
    buildingName: string;
    city: string | null;
    province: string | null;
    clientAmountCharged: number;
    serviceExpensesTotal: number;
    serviceExpenses: Array<{ concept: string; amount: number }>;
    cleaners: Array<{ fullName: string }>;
  }>;
  fixedExpenses: Array<{
    concept: string;
    buildingName: string | null;
    isGlobal: boolean;
    fullAmount: number;
    proratedAmount: number;
    included: boolean;
    prorationNote: string | null;
  }>;
  calculationLines: string[];
};

@Injectable()
export class CommissionPdfService {
  constructor(private readonly storage: StorageService) {}

  async generateAndStore(payload: CommissionPdfPayload, createdById?: string) {
    const buffer = await this.buildPdf(payload);
    const key = `commission-pdfs/${payload.id}/v${payload.version}.pdf`;
    await this.storage.upload(key, buffer, 'application/pdf');
    return {
      storageKey: key,
      storageBucket: this.storage.storageBucketName,
      createdById,
    };
  }

  private buildPdf(payload: CommissionPdfPayload): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const money = (n: number) =>
        n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

      doc.fontSize(16).text('Rendición de comisiones', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#555').text(`Versión PDF ${payload.version}`);
      doc.fillColor('#000');
      doc.moveDown();

      doc.fontSize(11).text(`Beneficiario: ${payload.beneficiaryName}`);
      doc.text(`Período: ${payload.dateFrom} → ${payload.dateTo}`);
      doc.text(`Porcentaje de comisión: ${payload.percentage}%`);
      doc.text(`Generada: ${payload.createdAt}`);
      doc.moveDown();

      doc.fontSize(12).text('Cálculo', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10);
      for (const line of payload.calculationLines) {
        doc.text(`• ${line}`);
      }
      doc.moveDown();
      doc.fontSize(11).text(`Total cobrado al cliente: ${money(payload.totalClientCharged)}`);
      doc.text(`(-) Gastos de servicios: ${money(payload.totalServiceExpenses)}`);
      doc.text(`(-) Gastos fijos (prorrateados incluidos): ${money(payload.totalFixedExpenses)}`);
      doc.text(`Neto: ${money(payload.netAmount)}`);
      doc
        .fontSize(12)
        .text(`Comisión (${payload.percentage}%): ${money(payload.commissionAmount)}`, {
          underline: true,
        });
      doc.moveDown();

      doc.fontSize(12).text('Servicios incluidos', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(9);
      for (const item of payload.items) {
        const dateLabel = item.scheduledDate ?? 'Sin fecha';
        const location = [item.city, item.province].filter(Boolean).join(', ');
        const cleaners = item.cleaners.map((c) => c.fullName).join(', ') || '—';
        doc.text(
          `${dateLabel} · ${item.title} · ${item.buildingName}${location ? ` (${location})` : ''}`,
        );
        doc.text(
          `  Limpiadores: ${cleaners} · Cobrado: ${money(item.clientAmountCharged)} · Gastos: ${money(item.serviceExpensesTotal)}`,
        );
        if (item.serviceExpenses.length > 0) {
          for (const exp of item.serviceExpenses) {
            doc.text(`    - ${exp.concept}: ${money(exp.amount)}`);
          }
        }
        doc.moveDown(0.3);
      }

      doc.moveDown(0.5);
      doc.fontSize(12).text('Gastos fijos', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(9);
      for (const fe of payload.fixedExpenses) {
        const scope = fe.isGlobal ? 'Global' : fe.buildingName ?? 'Edificio';
        const status = fe.included ? 'Incluido' : 'Excluido';
        doc.text(
          `${fe.concept} (${scope}) · Monto: ${money(fe.fullAmount)} · Prorrateado: ${money(fe.proratedAmount)} · ${status}`,
        );
        if (fe.prorationNote) {
          doc.text(`  ${fe.prorationNote}`);
        }
        doc.moveDown(0.2);
      }

      doc.end();
    });
  }
}
