import { PrismaClient, Prisma } from '@prisma/client';
import config from '../config';
import logger from '../config/logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Always emit error events; additionally emit warnings in development.
const errorLogDef: Prisma.LogDefinition = { emit: 'event', level: 'error' };
const warnLogDef: Prisma.LogDefinition = { emit: 'event', level: 'warn' };

const prismaClient =
  globalThis.prisma ??
  new PrismaClient({
    log: config.env === 'development' ? [errorLogDef, warnLogDef] : [errorLogDef],
  });

// Forward Prisma log events to the application logger so warnings/errors
// are not silently dropped when emit:'event' is configured.
// Prisma's $on overloads are typed from the literal log config; the type assertion
// is the standard pattern when log config is not a compile-time literal.
(prismaClient as PrismaClient<Prisma.PrismaClientOptions, 'error' | 'warn'>).$on(
  'error',
  (e: Prisma.LogEvent) => {
    logger.error('Prisma error', { message: e.message, target: e.target });
  }
);

if (config.env === 'development') {
  (prismaClient as PrismaClient<Prisma.PrismaClientOptions, 'error' | 'warn'>).$on(
    'warn',
    (e: Prisma.LogEvent) => {
      logger.warn('Prisma warning', { message: e.message, target: e.target });
    }
  );
}

if (config.env !== 'production') {
  globalThis.prisma = prismaClient;
}

export default prismaClient;
