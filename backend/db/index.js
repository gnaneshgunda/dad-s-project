const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

// Supabase free tier allows ~20 direct connections.
// PgBouncer pooler (port 6543) handles pooling server-side, so keep client pool small.
const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'error'] : ['error'],
  datasourceUrl: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&connection_limit=15&pool_timeout=20' : '?connection_limit=15&pool_timeout=20'),
});

globalForPrisma.prisma = prisma;

module.exports = prisma;
