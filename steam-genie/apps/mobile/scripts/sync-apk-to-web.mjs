#!/usr/bin/env node
/**
 * Publica la APK en la web admin (apps/web/public/downloads).
 *
 * Uso:
 *   node scripts/sync-apk-to-web.mjs                    # solo actualiza apk-info.json
 *   node scripts/sync-apk-to-web.mjs ./ruta/app.apk     # copia APK + actualiza versión
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const webDownloadsDir = path.resolve(mobileRoot, '../web/public/downloads');
const configPath = path.join(mobileRoot, 'app.config.ts');
const apkFilename = 'steam-genie.apk';

function readAppVersion() {
  const config = fs.readFileSync(configPath, 'utf8');
  const version = config.match(/^\s*version:\s*'([^']+)'/m)?.[1];
  const versionCode = Number.parseInt(config.match(/versionCode:\s*(\d+)/)?.[1] ?? '', 10);

  if (!version || Number.isNaN(versionCode)) {
    throw new Error('No se pudo leer version o versionCode desde app.config.ts');
  }

  return { version, versionCode };
}

const apkSource = process.argv[2];
const { version, versionCode } = readAppVersion();

fs.mkdirSync(webDownloadsDir, { recursive: true });

const info = {
  version,
  versionCode,
  filename: apkFilename,
  updatedAt: new Date().toISOString().slice(0, 10),
};

fs.writeFileSync(
  path.join(webDownloadsDir, 'apk-info.json'),
  `${JSON.stringify(info, null, 2)}\n`,
  'utf8',
);

console.log(`apk-info.json → v${version} (build ${versionCode})`);

if (apkSource) {
  const resolved = path.resolve(apkSource);
  if (!fs.existsSync(resolved)) {
    console.error(`No existe el archivo: ${resolved}`);
    process.exit(1);
  }

  const dest = path.join(webDownloadsDir, apkFilename);
  fs.copyFileSync(resolved, dest);
  const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log(`APK copiada → ${dest} (${sizeMb} MB)`);
  console.log('Hacé commit y deploy de apps/web para publicar la descarga.');
} else {
  console.log('Sin ruta de APK: solo se actualizó apk-info.json.');
  console.log(`Para copiar la APK: node scripts/sync-apk-to-web.mjs <ruta-al-apk>`);
}
