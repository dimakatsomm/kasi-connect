import { Decimal } from '@prisma/client/runtime/library';
import { SESSION_STATES, VALID_TRANSITIONS } from '../src/services/sessionStates';

// Mock ioredis
jest.mock('ioredis', () => {
  const store = new Map<string, string>();

  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    _store: store,
    _clear: () => store.clear(),
  }));
});

import * as sessionService from '../src/services/sessionService';

describe('Session Service', () => {
  beforeEach(() => {
    // Clear the mock Redis store between tests
    const client = sessionService.getRedisClient() as unknown as {
      _clear?: () => void;
    };
    client._clear?.();
  });

  describe('createSession', () => {
    test('creates a session with initial state', async () => {
      const session = await sessionService.createSession('+27821000001');
      expect(session.phone).toBe('+27821000001');
      expect(session.state).toBe(SESSION_STATES.AWAITING_VENDOR_TYPE);
      expect(session.items).toEqual([]);
    });

    test('creates session with vendorId', async () => {
      const session = await sessionService.createSession(
        '+27821000002',
        'vendor-123'
      );
      expect(session.vendorId).toBe('vendor-123');
    });
  });

  describe('getSession / getOrCreateSession', () => {
    test('returns null for non-existent session', async () => {
      const session = await sessionService.getSession('+27821999999');
      expect(session).toBeNull();
    });

    test('getOrCreateSession creates if not found', async () => {
      const session = await sessionService.getOrCreateSession('+27821000003');
      expect(session).not.toBeNull();
      expect(session.state).toBe(SESSION_STATES.AWAITING_VENDOR_TYPE);
    });

    test('getOrCreateSession returns existing session', async () => {
      await sessionService.createSession('+27821000004');
      const session = await sessionService.getOrCreateSession('+27821000004');
      expect(session.phone).toBe('+27821000004');
    });
  });

  describe('updateSession', () => {
    test('merges updates into existing session', async () => {
      await sessionService.createSession('+27821000005');
      const updated = await sessionService.updateSession('+27821000005', {
        vendorId: 'v1',
      });
      expect(updated.vendorId).toBe('v1');
      expect(updated.state).toBe(SESSION_STATES.AWAITING_VENDOR_TYPE);
    });

    test('throws if session does not exist', async () => {
      await expect(
        sessionService.updateSession('+27821999998', { vendorId: 'v1' })
      ).rejects.toThrow();
    });
  });

  describe('transitionSession', () => {
    test('transitions to valid next state', async () => {
      await sessionService.createSession('+27821000006');
      const session = await sessionService.transitionSession(
        '+27821000006',
        SESSION_STATES.AWAITING_ITEMS
      );
      expect(session.state).toBe(SESSION_STATES.AWAITING_ITEMS);
    });

    test('throws on invalid transition', async () => {
      await sessionService.createSession('+27821000007');
      await expect(
        sessionService.transitionSession(
          '+27821000007',
          SESSION_STATES.ORDER_PLACED
        )
      ).rejects.toThrow('Invalid state transition');
    });

    test('merges extra fields during transition', async () => {
      await sessionService.createSession('+27821000008');
      const session = await sessionService.transitionSession(
        '+27821000008',
        SESSION_STATES.AWAITING_ITEMS,
        { vendorId: 'v2' }
      );
      expect(session.vendorId).toBe('v2');
    });
  });

  describe('resetSession', () => {
    test('resets state and items', async () => {
      await sessionService.createSession('+27821000009');
      await sessionService.transitionSession(
        '+27821000009',
        SESSION_STATES.AWAITING_ITEMS
      );
      await sessionService.updateSession('+27821000009', {
        items: [
          {
            item: { quantity: 1, name: 'bread', raw: 'bread' },
            product: {
              id: 'p1',
              vendor_id: 'v1',
              name: 'Bread',
              description: null,
              price: new Decimal('15.00'),
              image_url: null,
              stock_level: 10,
              low_stock_threshold: 5,
              is_available: true,
              is_special: false,
              special_price: null,
              aliases: [],
              created_at: new Date(),
              updated_at: new Date(),
            },
            quantity: 1,
          },
        ],
      });

      const reset = await sessionService.resetSession('+27821000009');
      expect(reset.state).toBe(SESSION_STATES.AWAITING_VENDOR_TYPE);
      expect(reset.items).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    test('removes the session', async () => {
      await sessionService.createSession('+27821000010');
      await sessionService.deleteSession('+27821000010');
      const session = await sessionService.getSession('+27821000010');
      expect(session).toBeNull();
    });
  });
});

describe('Session States — VALID_TRANSITIONS', () => {
  test('AWAITING_VENDOR_TYPE can only go to AWAITING_ITEMS', () => {
    const allowed = VALID_TRANSITIONS[SESSION_STATES.AWAITING_VENDOR_TYPE];
    expect(allowed).toContain(SESSION_STATES.AWAITING_ITEMS);
    expect(allowed).toHaveLength(1);
  });

  test('AWAITING_ITEMS can go to AWAITING_CLARIFICATION or AWAITING_CONFIRMATION', () => {
    const allowed = VALID_TRANSITIONS[SESSION_STATES.AWAITING_ITEMS];
    expect(allowed).toContain(SESSION_STATES.AWAITING_CLARIFICATION);
    expect(allowed).toContain(SESSION_STATES.AWAITING_CONFIRMATION);
  });

  test('ORDER_PLACED can restart the flow', () => {
    const allowed = VALID_TRANSITIONS[SESSION_STATES.ORDER_PLACED];
    expect(allowed).toContain(SESSION_STATES.AWAITING_VENDOR_TYPE);
  });
});
