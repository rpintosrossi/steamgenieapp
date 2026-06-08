process.env.DATABASE_URL = 'postgresql://steamgenie:steamgenie_dev@127.0.0.1:5432/steamgenie?sslmode=disable';
const { PrismaClient } = require('./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
p.$connect()
  .then(() => { console.log('PRISMA CONNECTED OK'); return p.$disconnect(); })
  .catch(e => { console.error('PRISMA FAIL:', e.message, '| code:', e.errorCode); process.exit(1); });
