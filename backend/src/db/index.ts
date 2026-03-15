import { PrismaClient, Prisma } from '@prisma/client';
import config from '../config';
import logger from '../config/logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const logLevels: Prisma.LogDefinition[] =
  config.env === 'development'
    ? [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ]
    : [{ emit: 'event', level: 'error' }];

const prismaClient =
  globalThis.prisma ??
  new PrismaClient({
    log: logLevels,
  });

if (config.env !== 'production') {
  globalThis.prisma = prismaClient;
}

export default prismaClient;
