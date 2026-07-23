/**
 * Genera el PDF comercial de Steam Genie (servicio de limpieza, 1 hoja).
 * Uso: pnpm --filter @steam-genie/web docs:pdf:comercial
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const webPublic = path.resolve(__dirname, '../public');
const outDir = path.resolve(root, 'docs/comercial');
const outPdf = path.join(outDir, 'Steam-Genie-Presentacion.pdf');
const outPublic = path.join(webPublic, 'documentacion', 'Steam-Genie-Presentacion.pdf');

function fileToDataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function main() {
  const puppeteer = await import('puppeteer');

  const logoIcon = fileToDataUri(path.join(root, 'apps/api/assets/brand/logo-icon.png'));
  const logoText = fileToDataUri(path.join(webPublic, 'logo-text.png'));

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Steam Genie — Servicio de limpieza</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 210mm;
      height: 297mm;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      height: 297mm;
      padding: 13mm 15mm 12mm;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 85% 50% at 100% -8%, rgba(47, 111, 237, 0.13), transparent 55%),
        radial-gradient(ellipse 60% 40% at -8% 20%, rgba(10, 22, 40, 0.05), transparent 50%),
        linear-gradient(180deg, #f8fafc 0%, #ffffff 38%, #f8fafc 100%);
      z-index: 0;
    }
    .page > *:not(.bg) { position: relative; z-index: 1; }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 2px solid #e2e8f0;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { width: 48px; height: 48px; border-radius: 50%; display: block; }
    .brand-text { height: 36px; width: auto; display: block; }
    .tag {
      font-size: 9pt;
      color: #64748b;
      text-align: right;
      line-height: 1.35;
    }
    .tag strong {
      display: block;
      color: #0a1628;
      font-size: 10pt;
      letter-spacing: 0.02em;
    }

    .hero { margin-bottom: 15px; }
    .hero h1 {
      font-size: 20pt;
      line-height: 1.18;
      color: #0a1628;
      font-weight: 750;
      letter-spacing: -0.02em;
      max-width: 17.5cm;
    }
    .hero h1 span { color: #2f6fed; }
    .hero p {
      margin-top: 8px;
      font-size: 11pt;
      line-height: 1.4;
      color: #475569;
      max-width: 17.5cm;
    }

    .pillars {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 9px;
      margin-bottom: 16px;
    }
    .pillar {
      border-radius: 12px;
      padding: 13px 12px;
      color: #fff;
      min-height: 96px;
    }
    .pillar:nth-child(1) { background: #0a1628; }
    .pillar:nth-child(2) {
      background: linear-gradient(145deg, #1d4ed8 0%, #2f6fed 60%, #3b82f6 100%);
    }
    .pillar:nth-child(3) { background: #123056; }
    .pillar .label {
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.72;
      margin-bottom: 4px;
    }
    .pillar h2 {
      font-size: 12pt;
      margin-bottom: 5px;
      color: #fff;
    }
    .pillar p {
      font-size: 9pt;
      line-height: 1.35;
      opacity: 0.94;
    }

    .section { margin-bottom: 15px; }
    .section-title {
      font-size: 11.5pt;
      color: #0a1628;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .section-title::after {
      content: "";
      display: block;
      width: 32px;
      height: 3px;
      background: #2f6fed;
      margin-top: 5px;
      border-radius: 2px;
    }

    .benefits {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .benefit {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 11px 12px;
    }
    .benefit h3 {
      font-size: 10.5pt;
      color: #0a1628;
      margin-bottom: 2px;
    }
    .benefit p {
      font-size: 9pt;
      color: #64748b;
      line-height: 1.3;
    }

    .app-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .app-item {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 11px 12px;
    }
    .app-item h3 {
      font-size: 10.5pt;
      color: #1d4ed8;
      margin-bottom: 2px;
    }
    .app-item p {
      font-size: 9pt;
      color: #334155;
      line-height: 1.3;
    }

    .audience {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: auto;
      margin-bottom: 10px;
    }
    .chip {
      font-size: 9pt;
      color: #0a1628;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      padding: 5px 11px;
    }

    footer {
      font-size: 8pt;
      color: #94a3b8;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="bg"></div>

    <header>
      <div class="brand">
        <img class="brand-icon" src="${logoIcon}" alt="Steam Genie" />
        <img class="brand-text" src="${logoText}" alt="Steam Genie" />
      </div>
      <div class="tag">
        <strong>Servicio de limpieza profesional</strong>
        Hoteles · Edificios · Empresas
      </div>
    </header>

    <div class="hero">
      <h1>Limpieza confiable, <span>con control real de cada servicio</span></h1>
      <p>
        En Steam Genie nos ocupamos de la limpieza de tu hotel, edificio o empresa
        con personal propio, seguimiento del trabajo y evidencia de lo realizado.
      </p>
    </div>

    <div class="pillars">
      <div class="pillar">
        <div class="label">Servicio</div>
        <h2>Limpieza profesional</h2>
        <p>Habitaciones, áreas comunes y espacios de trabajo, con estándar consistente.</p>
      </div>
      <div class="pillar">
        <div class="label">Equipo</div>
        <h2>Personal a cargo</h2>
        <p>Personal capacitado, con presencia en sitio y supervisión del día a día.</p>
      </div>
      <div class="pillar">
        <div class="label">Confianza</div>
        <h2>Todo queda registrado</h2>
        <p>Sabés qué se hizo, cuándo y con respaldo fotográfico cuando hace falta.</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Beneficios para tu operación</div>
      <div class="benefits">
        <div class="benefit">
          <h3>Tranquilidad operativa</h3>
          <p>Nos hacemos cargo de la limpieza para que vos te enfoques en tu negocio.</p>
        </div>
        <div class="benefit">
          <h3>Calidad consistente</h3>
          <p>Mismo criterio todos los días: espacios listos, presentables y a tiempo.</p>
        </div>
        <div class="benefit">
          <h3>Seguimiento del servicio</h3>
          <p>Visibilidad de lo pendiente, lo realizado y el avance del día.</p>
        </div>
        <div class="benefit">
          <h3>Evidencia ante reclamos</h3>
          <p>Registro del trabajo realizado para resolver dudas con hechos, no con supuestos.</p>
        </div>
        <div class="benefit">
          <h3>Respuesta ágil</h3>
          <p>Pedidos extras, checkouts y urgencias coordinados sin improvisar.</p>
        </div>
        <div class="benefit">
          <h3>Un solo interlocutor</h3>
          <p>Coordinás con Steam Genie: servicio, personal y control en un mismo equipo.</p>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Cómo controlamos tu servicio</div>
      <div class="app-grid">
        <div class="app-item">
          <h3>Fichaje en el edificio</h3>
          <p>El personal marca ingreso y egreso en tu sitio: sabés quién está trabajando.</p>
        </div>
        <div class="app-item">
          <h3>Estado de cada espacio</h3>
          <p>Habitaciones y zonas con seguimiento: qué está listo y qué falta atender.</p>
        </div>
        <div class="app-item">
          <h3>Fotos y checklist</h3>
          <p>Cada servicio puede quedar documentado con evidencia visual y pasos cumplidos.</p>
        </div>
        <div class="app-item">
          <h3>Checkouts al día</h3>
          <p>Las salidas de huéspedes se convierten en trabajos claros, asignados y controlados.</p>
        </div>
        <div class="app-item">
          <h3>Alertas de insumos</h3>
          <p>Detectamos faltantes a tiempo para que no se corte el servicio por stock.</p>
        </div>
        <div class="app-item">
          <h3>Historial y reportes</h3>
          <p>Consultá lo realizado por día, personal o edificio cuando lo necesites.</p>
        </div>
      </div>
    </div>

    <div class="audience">
      <span class="chip">Hoteles</span>
      <span class="chip">Edificios residenciales</span>
      <span class="chip">Oficinas y empresas</span>
      <span class="chip">Servicios particulares</span>
    </div>

    <footer>Steam Genie — servicio de limpieza profesional con control real</footer>
  </section>
</body>
</html>`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(outPublic), { recursive: true });

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const tmpPdf = `${outPdf}.tmp`;
    await page.pdf({
      path: tmpPdf,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    });
    await page.close();

    for (const target of [outPdf, outPublic]) {
      try {
        fs.copyFileSync(tmpPdf, target);
        console.log(`OK → ${target}`);
      } catch {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fallback = target.replace(/\.pdf$/i, `-${stamp}.pdf`);
        fs.copyFileSync(tmpPdf, fallback);
        console.warn(`No se pudo sobrescribir (¿está abierto?): ${target}`);
        console.log(`OK → ${fallback}`);
      }
    }

    fs.unlinkSync(tmpPdf);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
