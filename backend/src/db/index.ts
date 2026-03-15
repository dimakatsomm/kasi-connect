import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import config from '../config';
import logger from '../config/logger';

// Export Prisma client for new code
export { prisma, disconnectPrisma } from './prisma';

let pool: Pool | undefined;

/**
 * Returns the singleton pg Pool instance. Creates it on first call.
 */
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      min: config.db.pool.min,
      max: config.db.pool.max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err: Error) => {
      logger.error('Unexpected error on idle pg client', { error: err.message });
    });

    logger.info('PostgreSQL connection pool created');
  }
  return pool;
}

/**
 * Execute a parameterised query.
 * @param text   SQL statement
 * @param params Query parameters
 */
async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await getPool().query<T>(text, params);
  const duration = Date.now() - start;
  logger.debug('Executed query', { text, duration, rows: res.rowCount });
  return res;
}

/**
 * Acquire a client for transactions.
 */
async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export { query, getClient, getPool };
