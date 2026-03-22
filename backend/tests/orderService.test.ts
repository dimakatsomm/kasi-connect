import {
  estimateReadyTime,
  getNextQueuePosition,
  upsertCustomer,
  getCustomerByPhone,
  createOrder,
} from '../src/services/orderService';

// Mock database (Prisma client)
jest.mock('../src/db', () => ({
  __esModule: true,
  default: {
    order: {
      count: jest.fn(),
    },
    customer: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock Kafka producer
jest.mock('../src/kafka/producer', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../src/db';
import { Prisma } from '@prisma/client';
const { Decimal } = Prisma;
type PrismaMock = {
  order: {
    count: jest.Mock;
  };
  customer: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};
const mockedPrisma = prisma as unknown as PrismaMock;

describe('Order Service — estimateReadyTime', () => {
  test('returns a future Date', () => {
    const result = estimateReadyTime(1);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  test('position 1 gives minimum time (15 min)', () => {
    const result = estimateReadyTime(1);
    const diffMs = result.getTime() - Date.now();
    expect(diffMs).toBeGreaterThanOrEqual(14 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(16 * 60 * 1000);
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
    expect(diff).toBeCloseTo(5 * 60 * 1000, -3);
  });
});

describe('Order Service — getNextQueuePosition', () => {
  test('returns count + 1', async () => {
    mockedPrisma.order.count.mockResolvedValueOnce(3);
    const pos = await getNextQueuePosition('vendor1');
    expect(pos).toBe(4);
  });

  test('returns 1 when queue is empty', async () => {
    mockedPrisma.order.count.mockResolvedValueOnce(0);
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
    mockedPrisma.customer.upsert.mockResolvedValueOnce(
      mockCustomer as never
    );

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
    mockedPrisma.customer.findUnique.mockResolvedValueOnce(
      mockCustomer as never
    );

    const customer = await getCustomerByPhone('+27821234567');
    expect(customer).toEqual(mockCustomer);
  });

  test('returns null when not found', async () => {
    mockedPrisma.customer.findUnique.mockResolvedValueOnce(null);

    const customer = await getCustomerByPhone('+27821999999');
    expect(customer).toBeNull();
  });
});

describe('Order Service — createOrder', () => {
  const mockTx = {
    vendor: { findUniqueOrThrow: jest.fn() },
    order: { count: jest.fn(), create: jest.fn() },
    orderItem: { create: jest.fn() },
    customer: { update: jest.fn() },
    $executeRaw: jest.fn(),
  };

  const mockProduct = {
    id: 'p1',
    vendor_id: 'v1',
    sub_category_id: null,
    name: 'Bread',
    price: new Decimal('15.00'),
    special_price: null,
    description: null,
    image_url: null,
    stock_level: 10,
    low_stock_threshold: 5,
    is_available: true,
    is_special: false,
    aliases: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const baseParams = {
    vendorId: 'v1',
    customerId: 'c1',
    items: [{ item: { quantity: 2, name: 'Bread', raw: 'bread' }, product: mockProduct, quantity: 2 }],
    fulfilmentType: 'collection' as const,
    deliveryAddress: null,
    deliveryFee: 0,
    subtotal: 30,
    total: 30,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)
    );
  });

  test('creates order and decrements stock successfully', async () => {
    mockTx.vendor.findUniqueOrThrow.mockResolvedValue({ id: 'v1', type: 'food' });
    mockTx.order.count.mockResolvedValue(2);
    mockTx.order.create.mockResolvedValue({
      id: 'order1',
      vendor_id: 'v1',
      customer_id: 'c1',
      status: 'confirmed',
    });
    mockTx.orderItem.create.mockResolvedValue({});
    mockTx.$executeRaw.mockResolvedValue(1);
    mockTx.customer.update.mockResolvedValue({});

    const order = await createOrder(baseParams);
    expect(order.id).toBe('order1');
    expect(mockTx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockTx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ queue_position: 3 }) })
    );
  });

  test('throws on insufficient stock', async () => {
    mockTx.vendor.findUniqueOrThrow.mockResolvedValue({ id: 'v1', type: 'food' });
    mockTx.order.count.mockResolvedValue(0);
    mockTx.order.create.mockResolvedValue({
      id: 'order2',
      vendor_id: 'v1',
      customer_id: 'c1',
      status: 'confirmed',
    });
    mockTx.orderItem.create.mockResolvedValue({});
    mockTx.$executeRaw.mockResolvedValue(0);

    await expect(createOrder(baseParams)).rejects.toThrow('Insufficient stock for product p1');
  });

  test('skips queue position for non-food vendors', async () => {
    mockTx.vendor.findUniqueOrThrow.mockResolvedValue({ id: 'v1', type: 'retail' });
    mockTx.order.create.mockResolvedValue({
      id: 'order3',
      vendor_id: 'v1',
      customer_id: 'c1',
      status: 'confirmed',
    });
    mockTx.orderItem.create.mockResolvedValue({});
    mockTx.$executeRaw.mockResolvedValue(1);
    mockTx.customer.update.mockResolvedValue({});

    const order = await createOrder(baseParams);
    expect(order.id).toBe('order3');
    expect(mockTx.order.count).not.toHaveBeenCalled();
    expect(mockTx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ queue_position: null }) })
    );
  });
});
