const { PrismaClient } = require('@prisma/client');

// Reuse one client per process — avoids extra connections on hot reload / multiple imports.
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
