const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

// When using Supabase's PgBouncer pooler (port 6543, pgbouncer=true),
// PgBouncer manages the server-side pool. Prisma only needs connection_limit=1
// on its end — more connections here don't help and can cause socket hangs.
// Do NOT append session-level params (e.g. statement_timeout) because
// PgBouncer in transaction mode ignores them and may reject the connection.
const baseUrl = process.env.DATABASE_URL || '';
const sep = baseUrl.includes('?') ? '&' : '?';
const isPgBouncer = baseUrl.includes('pgbouncer=true');
const datasourceUrl = baseUrl + sep + (isPgBouncer
  ? 'connection_limit=1&pool_timeout=60'
  : 'connection_limit=10&pool_timeout=60');

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'error'] : ['error'],
  datasourceUrl,
});

globalForPrisma.prisma = prisma;

module.exports = prisma;
