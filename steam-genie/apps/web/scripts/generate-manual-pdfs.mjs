import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const puppeteer = await import('puppeteer');
  const { marked } = await import('marked');

  const docsDir = path.resolve(__dirname, '../../../docs');
  const outDir = path.resolve(__dirname, '../public/documentacion');

  const manuals = [
    {
      md: 'manual-admin.md',
      pdf: 'manual-admin.pdf',
      title: 'Steam Genie — Manual Administrador',
    },
    {
      md: 'manual-tecnico.md',
      pdf: 'manual-tecnico.pdf',
      title: 'Steam Genie — Manual Técnico / Limpiador',
    },
  ];

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const manual of manuals) {
      const mdPath = path.join(docsDir, manual.md);
      const pdfPath = path.join(outDir, manual.pdf);
      const markdown = fs.readFileSync(mdPath, 'utf8');
      const bodyHtml = marked.parse(markdown);

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${manual.title}</title>
  <style>
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #1e293b;
      max-width: 800px;
      margin: 0 auto;
      padding: 8px 12px 24px;
    }
    h1 {
      font-size: 22pt;
      color: #0a1628;
      border-bottom: 3px solid #2f6fed;
      padding-bottom: 8px;
      margin-top: 0;
    }
    h2 {
      font-size: 14pt;
      color: #0a1628;
      margin-top: 28px;
      page-break-after: avoid;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    h3 {
      font-size: 12pt;
      color: #1d4ed8;
      margin-top: 18px;
      page-break-after: avoid;
    }
    h4 { font-size: 11pt; color: #334155; margin-top: 14px; }
    p, li { orphans: 3; widows: 3; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 16px;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #0a1628;
      color: #fff;
      font-weight: 600;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    blockquote {
      margin: 12px 0;
      padding: 10px 14px;
      background: #eff6ff;
      border-left: 4px solid #2f6fed;
      color: #1e40af;
      page-break-inside: avoid;
    }
    code {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 9.5pt;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
    }
    pre {
      background: #0a1628;
      color: #e2e8f0;
      padding: 12px 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    pre code { background: transparent; color: inherit; padding: 0; }
    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 24px 0;
    }
    a { color: #2f6fed; }
    strong { color: #0a1628; }
    ul, ol { padding-left: 1.35em; }
    li { margin: 3px 0; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b;padding:0 16mm;">${manual.title}</div>`,
        footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b;padding:0 16mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      });
      await page.close();

      fs.copyFileSync(mdPath, path.join(outDir, manual.md));
      console.log(`OK → ${pdfPath}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
