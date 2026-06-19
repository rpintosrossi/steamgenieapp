/**
 * Test end-to-end de carga masiva Excel.
 * Uso: node scripts/test-bulk-import.mjs
 */
import { createRequire } from 'module';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ExcelJS = require('../apps/api/node_modules/exceljs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL ?? 'http://localhost:4000';
const ADMIN_DNI = process.env.SEED_ADMIN_DNI ?? '12345678';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '01012000';

const results = [];
let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed += 1;
  results.push({ name, status: 'OK', detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed += 1;
  results.push({ name, status: 'FAIL', detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dni: ADMIN_DNI, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.accessToken;
}

async function buildTestWorkbook(buildingName) {
  const suffix = Date.now().toString().slice(-6);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Carga masiva');
  sheet.addRow([
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
  ]);

  // 1. Estructura nueva (planta/zona)
  sheet.addRow([
    buildingName,
    `Planta Test ${suffix}`,
    `Zona Test ${suffix}`,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  // 2. Tarea en zona sin subzonas
  sheet.addRow([
    buildingName,
    `Planta Test ${suffix}`,
    `Zona Test ${suffix}`,
    '',
    `Tarea import ${suffix}`,
    'Diaria',
    '2026-06-01',
    'Sí',
    'Sí',
    'Sí',
  ]);

  // 3. Subzona + tarea
  sheet.addRow([
    buildingName,
    `Planta Test ${suffix}`,
    `Zona Sub ${suffix}`,
    `Sub A ${suffix}`,
    `Tarea sub ${suffix}`,
    'Semanal',
    '',
    'No',
    'Sí',
    'Sí',
  ]);

  // 4. Error: tarea en zona con subzona sin indicar subzona
  sheet.addRow([
    buildingName,
    `Planta Test ${suffix}`,
    `Zona Sub ${suffix}`,
    '',
    `Tarea invalida ${suffix}`,
    'Diaria',
    '',
    '',
    '',
    '',
  ]);

  // 5. Error: edificio inexistente
  sheet.addRow([
    `Edificio Fantasma ${suffix}`,
    'Planta X',
    'Zona X',
    '',
    'Tarea X',
    'Diaria',
    '',
    '',
    '',
    '',
  ]);

  // 6. Error: frecuencia inválida
  sheet.addRow([
    buildingName,
    `Planta Test ${suffix}`,
    `Zona Test ${suffix}`,
    '',
    `Tarea freq mala ${suffix}`,
    'Cada luna llena',
    '',
    '',
    '',
    '',
  ]);

  // 7. Omitida: misma tarea que fila 2
  sheet.addRow([
    buildingName,
    `Planta Test ${suffix}`,
    `Zona Test ${suffix}`,
    '',
    `Tarea import ${suffix}`,
    'Diaria',
    '',
    '',
    '',
    '',
  ]);

  const path = join(__dirname, `test-import-${suffix}.xlsx`);
  await workbook.xlsx.writeFile(path);
  return { path, suffix };
}

async function uploadExcel(token, filePath) {
  const buffer = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'test-import.xlsx');

  const res = await fetch(`${API}/bulk-import/excel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`\n=== Test bulk-import (${API}) ===\n`);

  let token;
  try {
    token = await login();
    ok('Login admin');
  } catch (e) {
    fail('Login admin', e.message);
    process.exit(1);
  }

  // Template download
  try {
    const res = await fetch(`${API}/bulk-import/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) {
      fail('GET /bulk-import/template', `status ${res.status}`);
    } else {
      const ct = res.headers.get('content-type') ?? '';
      const buf = Buffer.from(await res.arrayBuffer());
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const sheet = wb.getWorksheet('Carga masiva');
      if (!sheet) fail('Plantilla parseable', 'Falta hoja Carga masiva');
      else if (buf.length < 1000) fail('Plantilla tamaño', `${buf.length} bytes`);
      else ok('GET /bulk-import/template', `${buf.length} bytes, content-type: ${ct}`);
    }
  } catch (e) {
    fail('GET /bulk-import/template', e.message);
  }

  // Unauthorized
  try {
    const res = await fetch(`${API}/bulk-import/template`);
    if (res.status === 401) ok('Template sin auth → 401');
    else fail('Template sin auth', `esperaba 401, obtuvo ${res.status}`);
  } catch (e) {
    fail('Template sin auth', e.message);
  }

  // Get a building
  let buildingName = 'Edificio Demo Completo';
  try {
    const res = await fetch(`${API}/buildings?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.data?.length) buildingName = data.data[0].name;
    ok('Obtener edificio para test', buildingName);
  } catch (e) {
    fail('Obtener edificio', e.message);
  }

  // Upload test workbook
  let testPath;
  try {
    const { path, suffix } = await buildTestWorkbook(buildingName);
    testPath = path;

    const { status, body } = await uploadExcel(token, path);
    if (status !== 201 && status !== 200) {
      fail('POST /bulk-import/excel', `status ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    } else if (!body.rows || !Array.isArray(body.rows)) {
      fail('Respuesta import', 'Sin array rows');
    } else {
      ok('POST /bulk-import/excel', `${body.totalRows} filas procesadas`);

      const byStatus = {
        success: body.rows.filter((r) => r.status === 'success').length,
        error: body.rows.filter((r) => r.status === 'error').length,
        skipped: body.rows.filter((r) => r.status === 'skipped').length,
      };
      ok('Conteo estados', `OK=${byStatus.success} err=${byStatus.error} skip=${byStatus.skipped}`);

      if (body.summary.floorsCreated >= 1) ok('Creó planta nueva');
      else fail('Creó planta nueva', `floorsCreated=${body.summary.floorsCreated}`);

      if (body.summary.tasksCreated >= 2) ok('Creó tareas', `${body.summary.tasksCreated}`);
      else fail('Creó tareas', `tasksCreated=${body.summary.tasksCreated}`);

      const zoneSubError = body.rows.find(
        (r) => r.status === 'error' && r.message.includes('tiene subzonas'),
      );
      if (zoneSubError) ok('Error fila zona con subzonas', `fila ${zoneSubError.row}`);
      else fail('Error fila zona con subzonas', 'No se detectó');

      const buildingError = body.rows.find(
        (r) => r.status === 'error' && r.message.includes('no encontrado'),
      );
      if (buildingError) ok('Error edificio inexistente', `fila ${buildingError.row}`);
      else fail('Error edificio inexistente', 'No se detectó');

      const freqError = body.rows.find(
        (r) => r.status === 'error' && r.message.includes('Frecuencia inválida'),
      );
      if (freqError) ok('Error frecuencia inválida', `fila ${freqError.row}`);
      else fail('Error frecuencia inválida', 'No se detectó');

      const skipped = body.rows.find((r) => r.status === 'skipped');
      if (skipped) ok('Tarea duplicada omitida', `fila ${skipped.row}`);
      else fail('Tarea duplicada omitida', 'No se detectó');

      console.log('\n--- Detalle filas ---');
      for (const row of body.rows) {
        console.log(`  Fila ${row.row} [${row.status}]: ${row.message}`);
      }
    }
  } catch (e) {
    fail('Upload test workbook', e.message);
  } finally {
    if (testPath) {
      try {
        unlinkSync(testPath);
      } catch {
        /* ignore */
      }
    }
  }

  // Re-upload template oficial (smoke test parse)
  try {
    const res = await fetch(`${API}/bulk-import/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = join(__dirname, 'template-smoke.xlsx');
    writeFileSync(tmp, buf);
    const { status, body } = await uploadExcel(token, tmp);
    unlinkSync(tmp);
    if (status === 200 || status === 201) {
      ok('Importar plantilla oficial', `${body.totalRows} filas (ejemplo)`);
    } else {
      fail('Importar plantilla oficial', `status ${status}`);
    }
  } catch (e) {
    fail('Importar plantilla oficial', e.message);
  }

  console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
