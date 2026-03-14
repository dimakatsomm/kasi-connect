'use strict';

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../config/logger');
const { SESSION_STATES, VALID_TRANSITIONS } = require('./sessionStates');

const SESSION_PREFIX = 'kc:session:';

let redisClient;

/**
 * Returns the singleton Redis client.
 */
function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
  }
  return redisClient;
}

/**
 * Build the Redis key for a customer phone number.
 * @param {string} phone  E.164 phone number, e.g. "+27821234567"
 */
function sessionKey(phone) {
  return `${SESSION_PREFIX}${phone}`;
}

/**
 * Create a new session for a customer.
 * @param {string} phone
 * @param {string} vendorId  Optional – set when vendor context is known
 */
async function createSession(phone, vendorId = null) {
  const session = {
    phone,
    vendorId,
    state: SESSION_STATES.AWAITING_VENDOR_TYPE,
    items: [],
    pendingClarification: null,
    fulfilmentType: null,
    deliveryAddress: null,
    lastOrderId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const client = getRedisClient();
  await client.set(
    sessionKey(phone),
    JSON.stringify(session),
    'EX',
    config.redis.sessionTtl
  );

  logger.debug('Session created', { phone, state: session.state });
  return session;
}

/**
 * Retrieve an existing session.  Returns null if not found / expired.
 * @param {string} phone
 */
async function getSession(phone) {
  const client = getRedisClient();
  const raw = await client.get(sessionKey(phone));
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Retrieve an existing session or create a new one.
 * @param {string} phone
 */
async function getOrCreateSession(phone) {
  const existing = await getSession(phone);
  if (existing) return existing;
  return createSession(phone);
}

/**
 * Persist session updates back to Redis (resets the TTL).
 * @param {string} phone
 * @param {object} updates  Partial session fields to merge
 */
async function updateSession(phone, updates) {
  const session = await getSession(phone);
  if (!session) {
    throw new Error(`Session not found for ${phone}`);
  }

  const updated = { ...session, ...updates, updatedAt: Date.now() };
  const client = getRedisClient();
  await client.set(
    sessionKey(phone),
    JSON.stringify(updated),
    'EX',
    config.redis.sessionTtl
  );

  logger.debug('Session updated', { phone, state: updated.state });
  return updated;
}

/**
 * Transition the session to a new state.
 * Throws if the transition is not valid.
 *
 * @param {string} phone
 * @param {string} nextState  One of SESSION_STATES
 * @param {object} [extra]    Additional fields to merge into session
 */
async function transitionSession(phone, nextState, extra = {}) {
  const session = await getSession(phone);
  if (!session) {
    throw new Error(`Session not found for ${phone}`);
  }

  const allowed = VALID_TRANSITIONS[session.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid state transition: ${session.state} → ${nextState}`
    );
  }

  return updateSession(phone, { state: nextState, ...extra });
}

/**
 * Delete a session (e.g. after order placed or explicit reset).
 * @param {string} phone
 */
async function deleteSession(phone) {
  const client = getRedisClient();
  await client.del(sessionKey(phone));
  logger.debug('Session deleted', { phone });
}

/**
 * Reset a session back to the initial state without removing it.
 * Used to start a new order in the same conversation.
 * @param {string} phone
 */
async function resetSession(phone) {
  const session = await getSession(phone);
  if (!session) {
    return createSession(phone);
  }

  const reset = {
    ...session,
    state: SESSION_STATES.AWAITING_VENDOR_TYPE,
    vendorId: null,
    items: [],
    pendingClarification: null,
    fulfilmentType: null,
    deliveryAddress: null,
    updatedAt: Date.now(),
  };

  const client = getRedisClient();
  await client.set(
    sessionKey(phone),
    JSON.stringify(reset),
    'EX',
    config.redis.sessionTtl
  );

  logger.debug('Session reset', { phone });
  return reset;
}

module.exports = {
  SESSION_STATES,
  VALID_TRANSITIONS,
  getRedisClient,
  createSession,
  getSession,
  getOrCreateSession,
  updateSession,
  transitionSession,
  deleteSession,
  resetSession,
};
