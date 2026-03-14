'use strict';

const { Pool } = require('pg');
const config = require('../config');
const logger = require('../config/logger');

let pool;

/**
 * Returns the singleton pg Pool instance.
 * Creates it on first call.
 */
function getPool() {
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

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle pg client', { error: err.message });
    });

    logger.info('PostgreSQL connection pool created');
  }
  return pool;
}

/**
 * Execute a parameterised query.
 * @param {string} text  SQL statement
 * @param {Array}  params Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const res = await getPool().query(text, params);
  const duration = Date.now() - start;
  logger.debug('Executed query', { text, duration, rows: res.rowCount });
  return res;
}

/**
 * Acquire a client for transactions.
 */
async function getClient() {
  return getPool().connect();
}

module.exports = { query, getClient, getPool };
