import {
  estimateReadyTime,
  getNextQueuePosition,
  upsertCustomer,
  getCustomerByPhone,
} from '../src/services/orderService';

// Mock database
jest.mock('../src/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

// Mock Kafka producer
jest.mock('../src/kafka/producer', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import * as db from '../src/db';

describe('Order Service — estimateReadyTime', () => {
  test('returns a future Date', () => {
    const result = estimateReadyTime(1);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  test('position 1 gives minimum time (15 min)', () => {
    const result = estimateReadyTime(1);
    const diffMs = result.getTime() - Date.now();
    expect(diffMs).toBeGreaterThanOrEqual(14 * 60 * 1000); // at least 14 min
    expect(diffMs).toBeLessThanOrEqual(16 * 60 * 1000); // at most 16 min
  });

  test('higher queue position gives later time', () => {
    const time1 = estimateReadyTime(1);
    const time5 = estimateReadyTime(5);
    expect(time5.getTime()).toBeGreaterThan(time1.getTime());
  });

  test('each additional position adds ~5 minutes', () => {
    const time1 = estimateReadyTime(1);
    const time2 = estimateReadyTime(2);
    const diff = time2.getTime() - time1.getTime();
    expect(diff).toBeCloseTo(5 * 60 * 1000, -3); // within 1 second
  });
});

describe('Order Service — getNextQueuePosition', () => {
  test('returns count + 1', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ count: '3' }],
    });
    const pos = await getNextQueuePosition('vendor1');
    expect(pos).toBe(4);
  });

  test('returns 1 when queue is empty', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ count: '0' }],
    });
    const pos = await getNextQueuePosition('vendor1');
    expect(pos).toBe(1);
  });
});

describe('Order Service — upsertCustomer', () => {
  test('returns the upserted customer', async () => {
    const mockCustomer = {
      id: 'c1',
      phone: '+27821234567',
      name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_order_id: null,
    };
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockCustomer] });

    const customer = await upsertCustomer('+27821234567');
    expect(customer.phone).toBe('+27821234567');
  });
});

describe('Order Service — getCustomerByPhone', () => {
  test('returns customer when found', async () => {
    const mockCustomer = {
      id: 'c1',
      phone: '+27821234567',
      name: null,
      last_order_id: null,
      created_at: '',
      updated_at: '',
    };
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [mockCustomer] });

    const customer = await getCustomerByPhone('+27821234567');
    expect(customer).toEqual(mockCustomer);
  });

  test('returns null when not found', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    const customer = await getCustomerByPhone('+27821999999');
    expect(customer).toBeNull();
  });
});
