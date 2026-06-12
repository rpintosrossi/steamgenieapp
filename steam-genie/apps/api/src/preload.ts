/**
 * This file must be the FIRST thing executed. It loads .env into process.env
 * before any NestJS/Prisma module is required. nest build compiles it to
 * dist/preload.js, and nest-cli.json sets it as the entryFile wrapper.
 *
 * We use a dynamic require() chain so TypeScript does NOT hoist these as
 * ES module imports (which would be reordered before this file's execution).
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: envPath, override: true });
}

// Now bootstrap the actual app — all subsequent require()s will see DATABASE_URL
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./main');
