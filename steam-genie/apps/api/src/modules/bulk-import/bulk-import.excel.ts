import * as ExcelJS from 'exceljs';
import { TASK_FREQUENCIES } from '@steam-genie/shared-constants';
import type { ParsedImportRow, TemplateRowData } from './bulk-import.types';

export const TEMPLATE_HEADERS = [
  'Edificio',
  'Planta',
  'Zona',
  'Subzona',
  'Tarea',
  'Frecuencia',
  'Fecha inicio',
  'Requiere foto',
  'Permite observación',
  'Requiere motivo si no se hace',
] as const;

const HEADER_ALIASES: Record<string, keyof Omit<ParsedImportRow, 'rowNumber'>> = {
  edificio: 'buildingName',
  planta: 'floorName',
  zona: 'zoneName',
  subzona: 'subzoneName',
  tarea: 'taskName',
  frecuencia: 'frequencyRaw',
  'fecha inicio': 'startDateRaw',
  'fecha de inicio': 'startDateRaw',
  'requiere foto': 'requiresPhoto',
  'permite observacion': 'allowsObservation',
  'permite observación': 'allowsObservation',
  'requiere motivo si no se hace': 'requiresRejectionReason',
  'requiere motivo rechazo': 'requiresRejectionReason',
};

const FREQUENCY_LABELS: Record<string, string> = {
  EVENTUAL: 'Eventual (checkout)',
  DAILY: 'Diaria',
  MON_FRI: 'Lun–Vie',
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  BIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

export function frequencyLabel(code: string): string {
  return FREQUENCY_LABELS[code] ?? code;
}

function formatBooleanForExport(value: boolean): string {
  return value ? 'Sí' : 'No';
}

function templateRowToArray(row: TemplateRowData): (string | undefined)[] {
  return [
    row.buildingName,
    row.floorName,
    row.zoneName,
    row.subzoneName ?? '',
    row.taskName ?? '',
    row.frequencyRaw ?? '',
    row.startDateRaw ?? '',
    row.requiresPhoto !== undefined ? formatBooleanForExport(row.requiresPhoto) : '',
    row.allowsObservation !== undefined ? formatBooleanForExport(row.allowsObservation) : '',
    row.requiresRejectionReason !== undefined
      ? formatBooleanForExport(row.requiresRejectionReason)
      : '',
  ];
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\*+$/, '')
    .trim();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function parseBooleanCell(value: ExcelJS.CellValue): boolean | undefined {
  const text = cellText(value).toLowerCase();
  if (!text) return undefined;
  if (['si', 'sí', 'yes', 'true', '1', 'x', 'verdadero'].includes(text)) return true;
  if (['no', 'false', '0', 'falso'].includes(text)) return false;
  return undefined;
}

function isRowEmpty(values: string[]): boolean {
  return values.every((v) => !v.trim());
}

function mapHeaderRow(row: ExcelJS.Row): Map<number, keyof Omit<ParsedImportRow, 'rowNumber'>> {
  const mapping = new Map<number, keyof Omit<ParsedImportRow, 'rowNumber'>>();

  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const normalized = normalizeHeader(cellText(cell.value));
    const field = HEADER_ALIASES[normalized];
    if (field) mapping.set(colNumber, field);
  });

  return mapping;
}

export async function parseImportWorkbook(buffer: Buffer): Promise<ParsedImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings expect Node Buffer; runtime accepts Uint8Array.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet =
    workbook.getWorksheet('Carga masiva') ??
    workbook.worksheets.find((ws) => ws.name.toLowerCase() !== 'instrucciones') ??
    workbook.worksheets[0];

  if (!sheet) {
    throw new Error('El archivo no contiene hojas de cálculo.');
  }

  const headerRow = sheet.getRow(1);
  const columnMap = mapHeaderRow(headerRow);

  const requiredFields: Array<keyof Omit<ParsedImportRow, 'rowNumber'>> = [
    'buildingName',
    'floorName',
    'zoneName',
  ];
  const mappedFields = new Set(columnMap.values());
  const missing = requiredFields.filter((field) => !mappedFields.has(field));
  if (missing.length > 0) {
    throw new Error(
      'Faltan columnas obligatorias en la fila 1: Edificio, Planta y Zona. Descargá la plantilla oficial.',
    );
  }

  const rows: ParsedImportRow[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rawValues: string[] = [];

    row.eachCell({ includeEmpty: true }, (cell) => {
      rawValues.push(cellText(cell.value));
    });

    if (isRowEmpty(rawValues)) continue;

    const parsed: ParsedImportRow = { rowNumber, buildingName: '', floorName: '', zoneName: '' };

    columnMap.forEach((field, colNumber) => {
      const cellValue = row.getCell(colNumber).value;
      if (field === 'requiresPhoto' || field === 'allowsObservation' || field === 'requiresRejectionReason') {
        parsed[field] = parseBooleanCell(cellValue);
        return;
      }
      if (field === 'startDateRaw') {
        parsed.startDateRaw = cellValue;
        return;
      }
      const text = cellText(cellValue);
      if (field === 'buildingName') parsed.buildingName = text;
      if (field === 'floorName') parsed.floorName = text;
      if (field === 'zoneName') parsed.zoneName = text;
      if (field === 'subzoneName') parsed.subzoneName = text || undefined;
      if (field === 'taskName') parsed.taskName = text || undefined;
      if (field === 'frequencyRaw') parsed.frequencyRaw = text || undefined;
    });

    rows.push(parsed);
  }

  return rows;
}

export async function buildImportTemplateBuffer(
  dataRows?: TemplateRowData[],
  options?: { buildingName?: string; buildingScoped?: boolean },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Steam Genie';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Carga masiva');
  sheet.columns = TEMPLATE_HEADERS.map((header) => ({
    header,
    key: header,
    width: header.length + 6,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8F0FE' },
  };

  const rowsToWrite =
    dataRows ??
    (options?.buildingName
      ? [
          {
            buildingName: options.buildingName,
            floorName: 'Planta PB',
            zoneName: 'Cocina',
            subzoneName: 'Bacha',
            taskName: 'Limpiar y desinfectar bacha',
            frequencyRaw: 'Diaria',
            startDateRaw: '2026-01-01',
            requiresPhoto: true,
            allowsObservation: true,
            requiresRejectionReason: true,
          },
        ]
      : [
          {
            buildingName: 'Edificio Demo Completo',
            floorName: 'Planta PB',
            zoneName: 'Cocina',
            subzoneName: 'Bacha',
            taskName: 'Limpiar y desinfectar bacha',
            frequencyRaw: 'Diaria',
            startDateRaw: '2026-01-01',
            requiresPhoto: true,
            allowsObservation: true,
            requiresRejectionReason: true,
          },
          {
            buildingName: 'Edificio Demo Completo',
            floorName: 'Planta PB',
            zoneName: 'Baño',
            taskName: 'Desinfectar piso',
            frequencyRaw: 'Semanal',
            requiresPhoto: false,
            allowsObservation: true,
            requiresRejectionReason: true,
          },
          {
            buildingName: 'Edificio Demo Completo',
            floorName: 'Planta 1',
            zoneName: 'Habitación 1',
            subzoneName: 'Cama',
            taskName: 'Cambiar ropa de cama',
            frequencyRaw: 'Eventual (checkout)',
            requiresPhoto: true,
            allowsObservation: true,
            requiresRejectionReason: true,
          },
        ]);

  for (const row of rowsToWrite) {
    sheet.addRow(templateRowToArray(row));
  }

  const instructions = workbook.addWorksheet('Instrucciones');
  instructions.getColumn(1).width = 110;
  const lines = options?.buildingScoped
    ? [
        'INSTRUCCIONES — Carga masiva de estructura y tareas (edificio)',
        '',
        'Columnas obligatorias: Edificio, Planta, Zona.',
        'El edificio debe coincidir con el edificio desde el que descargaste la plantilla.',
        'Si la planta, zona o subzona no existen, se crean automáticamente.',
        'Si ya existen, no se duplican.',
        '',
        'Tarea y Frecuencia: completar ambas para crear o actualizar una tarea.',
        'Si dejás Tarea vacía, solo se crea/valida la estructura.',
        'Si una zona tiene subzonas, la tarea debe indicar Subzona.',
        '',
        'Al volver a cargar la plantilla con datos actuales:',
        '  • Filas sin cambios se omiten (no se duplican tareas).',
        '  • Filas nuevas crean estructura o tareas.',
        '  • Filas con tareas existentes actualizan frecuencia, fecha y opciones si cambiaron.',
        '',
        'Frecuencias válidas:',
        ...Object.entries(FREQUENCY_LABELS).map(([code, label]) => `  • ${label} (o ${code})`),
        '',
        'Fecha inicio: formato YYYY-MM-DD o DD/MM/YYYY.',
        'Campos Sí/No: Requiere foto, Permite observación, Requiere motivo si no se hace.',
      ]
    : [
        'INSTRUCCIONES — Carga masiva de estructura y tareas',
        '',
        'Columnas obligatorias: Edificio, Planta, Zona.',
        'El edificio debe existir previamente en el sistema (se identifica por nombre, sin distinguir mayúsculas).',
        'Si la planta, zona o subzona no existen, se crean automáticamente.',
        '',
        'Tarea y Frecuencia: completar ambas para crear una tarea. Si dejás Tarea vacía, solo se crea/valida la estructura.',
        'Si una zona tiene subzonas (existentes o creadas en el mismo archivo), la tarea debe indicar Subzona.',
        'Si intentás cargar una tarea directamente en una zona con subzonas, esa fila fallará con un error claro.',
        '',
        'Frecuencias válidas:',
        ...Object.entries(FREQUENCY_LABELS).map(([code, label]) => `  • ${label} (o ${code})`),
        '',
        'Fecha inicio: formato YYYY-MM-DD o DD/MM/YYYY. Si se omite, se usa la fecha de hoy.',
        'Campos Sí/No: Requiere foto, Permite observación, Requiere motivo si no se hace.',
        '',
        'Valores de ejemplo incluidos en la hoja "Carga masiva". Podés borrarlos y pegar tus datos.',
      ];
  lines.forEach((line, index) => {
    const row = instructions.addRow([line]);
    if (index === 0) row.font = { bold: true, size: 12 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function parseFrequency(raw: string | undefined): keyof typeof TASK_FREQUENCIES | null {
  if (!raw?.trim()) return null;

  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  for (const [code, label] of Object.entries(FREQUENCY_LABELS)) {
    const labelNorm = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (normalized === code.toLowerCase() || normalized === labelNorm) {
      return code as keyof typeof TASK_FREQUENCIES;
    }
  }

  const aliases: Record<string, keyof typeof TASK_FREQUENCIES> = {
    diario: 'DAILY',
    'lun-vie': 'MON_FRI',
    'lunes a viernes': 'MON_FRI',
    quincenal: 'BIWEEKLY',
    mensual: 'MONTHLY',
    trimestral: 'QUARTERLY',
    semestral: 'BIANNUAL',
    anual: 'ANNUAL',
    eventual: 'EVENTUAL',
    checkout: 'EVENTUAL',
  };

  return aliases[normalized] ?? null;
}

export function parseStartDate(raw: unknown): string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  const text = cellText(raw as ExcelJS.CellValue);
  if (!text) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return undefined;
}
