import Redis from 'ioredis';
import config from '../config';
import logger from '../config/logger';
import { SESSION_STATES, VALID_TRANSITIONS, SessionState } from './sessionStates';
import type { Session, VendorSession } from '../types';

const SESSION_PREFIX = 'kc:session:';
const VENDOR_PREFIX = 'kc:vendor:';

let redisClient: Redis | undefined;

/**
 * Returns the singleton Redis client.
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err: Error) =>
      logger.error('Redis error', { error: err.message })
    );
  }
  return redisClient;
}

/**
 * Build the Redis key for a customer phone number.
 * @param phone  E.164 phone number, e.g. "+27821234567"
 */
function sessionKey(phone: string): string {
  return `${SESSION_PREFIX}${phone}`;
}

/**
 * Create a new session for a customer.
 * @param phone
 * @param vendorId  Optional – set when vendor context is known
 */
export async function createSession(
  phone: string,
  vendorId: string | null = null
): Promise<Session> {
  const session: Session = {
    phone,
    vendorId,
    state: SESSION_STATES.AWAITING_SECTOR,
    sector: null,
    customerLatitude: null,
    customerLongitude: null,
    nearbyVendors: null,
    pendingOrderId: null,
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
 * Retrieve an existing session. Returns null if not found / expired.
 * @param phone
 */
export async function getSession(phone: string): Promise<Session | null> {
  const client = getRedisClient();
  const raw = await client.get(sessionKey(phone));
  if (!raw) return null;
  return JSON.parse(raw) as Session;
}

/**
 * Retrieve an existing session or create a new one.
 * @param phone
 */
export async function getOrCreateSession(phone: string): Promise<Session> {
  const existing = await getSession(phone);
  if (existing) return existing;
  return createSession(phone);
}

/**
 * Persist session updates back to Redis (resets the TTL).
 * @param phone
 * @param updates  Partial session fields to merge
 */
export async function updateSession(
  phone: string,
  updates: Partial<Session>
): Promise<Session> {
  const session = await getSession(phone);
  if (!session) {
    throw new Error(`Session not found for ${phone}`);
  }

  const updated: Session = { ...session, ...updates, updatedAt: Date.now() };
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
 * @param phone
 * @param nextState  One of SESSION_STATES
 * @param extra      Additional fields to merge into session
 */
export async function transitionSession(
  phone: string,
  nextState: SessionState,
  extra: Partial<Session> = {}
): Promise<Session> {
  const session = await getSession(phone);
  if (!session) {
    throw new Error(`Session not found for ${phone}`);
  }

  const allowed: SessionState[] =
    VALID_TRANSITIONS[session.state as SessionState] ?? [];
  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid state transition: ${session.state} → ${nextState}`
    );
  }

  return updateSession(phone, { state: nextState, ...extra });
}

/**
 * Delete a session (e.g. after order placed or explicit reset).
 * @param phone
 */
export async function deleteSession(phone: string): Promise<void> {
  const client = getRedisClient();
  await client.del(sessionKey(phone));
  logger.debug('Session deleted', { phone });
}

/**
 * Reset a session back to the initial state without removing it.
 * Used to start a new order in the same conversation.
 * @param phone
 */
export async function resetSession(phone: string): Promise<Session> {
  const session = await getSession(phone);
  if (!session) {
    return createSession(phone);
  }

  const reset: Session = {
    ...session,
    state: SESSION_STATES.AWAITING_SECTOR,
    vendorId: null,
    sector: null,
    customerLatitude: null,
    customerLongitude: null,
    nearbyVendors: null,
    pendingOrderId: null,
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

// ── Vendor session helpers ────────────────────────────────────────────────────

const VENDOR_TTL = 3600; // 1 hour

function vendorKey(phone: string): string {
  return `${VENDOR_PREFIX}${phone}`;
}

/**
 * Retrieve a vendor's chat session. Returns null if not found / expired.
 */
export async function getVendorSession(
  phone: string
): Promise<VendorSession | null> {
  const client = getRedisClient();
  const raw = await client.get(vendorKey(phone));
  if (!raw) return null;
  return JSON.parse(raw) as VendorSession;
}

/**
 * Create or update a vendor's chat session.
 */
export async function updateVendorSession(
  phone: string,
  updates: Partial<VendorSession> & { vendorId: string }
): Promise<VendorSession> {
  const existing = await getVendorSession(phone);

  const session: VendorSession = {
    vendorId: updates.vendorId,
    activeCustomerPhone: updates.activeCustomerPhone ?? existing?.activeCustomerPhone ?? null,
    activeOrderId: updates.activeOrderId ?? existing?.activeOrderId ?? null,
    updatedAt: Date.now(),
  };

  const client = getRedisClient();
  await client.set(vendorKey(phone), JSON.stringify(session), 'EX', VENDOR_TTL);

  logger.debug('Vendor session updated', { phone, session });
  return session;
}

/**
 * End the active vendor↔customer chat (clear the active customer pointer).
 */
export async function clearVendorChat(phone: string): Promise<void> {
  const existing = await getVendorSession(phone);
  if (!existing) return;

  const updated: VendorSession = {
    ...existing,
    activeCustomerPhone: null,
    activeOrderId: null,
    updatedAt: Date.now(),
  };

  const client = getRedisClient();
  await client.set(vendorKey(phone), JSON.stringify(updated), 'EX', VENDOR_TTL);
  logger.debug('Vendor chat cleared', { phone });
}

export { SESSION_STATES, VALID_TRANSITIONS };
export type { SessionState };
