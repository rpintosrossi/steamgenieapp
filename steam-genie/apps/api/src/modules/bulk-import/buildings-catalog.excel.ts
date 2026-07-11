import * as ExcelJS from 'exceljs';

export const BUILDINGS_CATALOG_HEADERS = [
  'Nombre',
  'Dirección',
  'Ciudad',
  'Provincia',
  'Latitud',
  'Longitud',
  'Radio GPS (m)',
] as const;

export type BuildingsCatalogParsedRow = {
  rowNumber: number;
  name: string;
  address?: string;
  city?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
  gpsRadiusM?: number;
};

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

function parseNumberCell(value: ExcelJS.CellValue): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = cellText(value).replace(',', '.');
  if (!text) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

const HEADER_MAP: Record<string, keyof Omit<BuildingsCatalogParsedRow, 'rowNumber'>> = {
  nombre: 'name',
  edificio: 'name',
  name: 'name',
  direccion: 'address',
  address: 'address',
  ciudad: 'city',
  city: 'city',
  localidad: 'city',
  provincia: 'province',
  province: 'province',
  latitud: 'latitude',
  lat: 'latitude',
  latitude: 'latitude',
  longitud: 'longitude',
  lon: 'longitude',
  lng: 'longitude',
  longitude: 'longitude',
  'radio gps (m)': 'gpsRadiusM',
  'radio gps': 'gpsRadiusM',
  radio: 'gpsRadiusM',
  gpsradiusm: 'gpsRadiusM',
};

export async function generateBuildingsCatalogTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Edificios');
  sheet.addRow([...BUILDINGS_CATALOG_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow([
    'Ejemplo Torre Norte',
    'Av. Corrientes 1234',
    'Ciudad Autónoma de Buenos Aires',
    'Ciudad Autónoma de Buenos Aires',
    '',
    '',
    '200',
  ]);
  sheet.columns = BUILDINGS_CATALOG_HEADERS.map(() => ({ width: 28 }));

  const help = workbook.addWorksheet('Instrucciones');
  help.addRow(['Importación masiva de edificios']);
  help.addRow([]);
  help.addRow(['Columnas:']);
  help.addRow(['- Nombre (*): obligatorio']);
  help.addRow(['- Dirección / Ciudad / Provincia: opcionales']);
  help.addRow(['- Latitud / Longitud: opcionales (si vienen, se usan tal cual)']);
  help.addRow(['- Radio GPS (m): opcional (default 200)']);
  help.addRow([]);
  help.addRow([
    'En la pantalla de importación podés marcar:',
  ]);
  help.addRow([
    '- No buscar dirección: guarda los textos sin geocodificar.',
  ]);
  help.addRow([
    '- Validar GPS al fichar: aplica el mismo valor a todos los edificios importados.',
  ]);
  help.getColumn(1).width = 100;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseBuildingsCatalogWorkbook(
  buffer: Buffer,
): Promise<BuildingsCatalogParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS tipados con Buffer distinto al de @types/node en algunas versiones.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet =
    workbook.getWorksheet('Edificios') ??
    workbook.worksheets.find((s) => normalizeHeader(s.name) !== 'instrucciones') ??
    workbook.worksheets[0];

  if (!sheet) {
    throw new Error('El Excel no tiene hojas legibles.');
  }

  const headerRow = sheet.getRow(1);
  const columnIndex = new Map<keyof Omit<BuildingsCatalogParsedRow, 'rowNumber'>, number>();

  headerRow.eachCell((cell, colNumber) => {
    const key = HEADER_MAP[normalizeHeader(cellText(cell.value))];
    if (key) columnIndex.set(key, colNumber);
  });

  if (!columnIndex.has('name')) {
    throw new Error('Falta la columna "Nombre" en el Excel.');
  }

  const rows: BuildingsCatalogParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const nameCol = columnIndex.get('name')!;
    const name = cellText(row.getCell(nameCol).value);
    if (!name) return;

    const get = (field: keyof Omit<BuildingsCatalogParsedRow, 'rowNumber'>) => {
      const col = columnIndex.get(field);
      return col ? row.getCell(col).value : undefined;
    };

    rows.push({
      rowNumber,
      name,
      address: cellText(get('address') as ExcelJS.CellValue) || undefined,
      city: cellText(get('city') as ExcelJS.CellValue) || undefined,
      province: cellText(get('province') as ExcelJS.CellValue) || undefined,
      latitude: parseNumberCell(get('latitude') as ExcelJS.CellValue),
      longitude: parseNumberCell(get('longitude') as ExcelJS.CellValue),
      gpsRadiusM: parseNumberCell(get('gpsRadiusM') as ExcelJS.CellValue),
    });
  });

  return rows;
}
