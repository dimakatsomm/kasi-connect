import { buildOrderSummary } from '../src/services/productService';
import type { MatchedItem } from '../src/types';

// Mock Prisma
jest.mock('../src/db', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../src/db';
import { matchProducts } from '../src/services/productService';

// Helper function to create Decimal-like objects for tests
function decimal(value: string | number) {
  return {
    toString: () => String(value),
    toNumber: () => Number(value),
    toFixed: () => Number(value).toFixed(2),
  } as any;
}

// Helper to create a minimal MatchedItem for buildOrderSummary tests
function makeItem(
  name: string,
  price: string,
  specialPrice: string | null,
  quantity: number
): MatchedItem {
  return {
    item: { quantity, name, raw: name },
    product: {
      id: 'p0',
      vendor_id: 'v0',
      name,
      description: null,
      price,
      image_url: null,
      stock_level: 10,
      low_stock_threshold: 5,
      is_available: true,
      is_special: specialPrice !== null,
      special_price: specialPrice,
      aliases: [],
      created_at: '',
      updated_at: '',
    },
    quantity,
  };
}

describe('Product Service — buildOrderSummary', () => {
  const items: MatchedItem[] = [
    makeItem('Bread', '15.00', null, 2),
    makeItem('Milk 1L', '22.00', null, 1),
  ];

  test('calculates subtotal and total correctly', () => {
    const { subtotal, total } = buildOrderSummary(items);
    expect(subtotal).toBeCloseTo(52.0);
    expect(total).toBeCloseTo(52.0);
  });

  test('adds delivery fee to total', () => {
    const { subtotal, total } = buildOrderSummary(items, 20);
    expect(subtotal).toBeCloseTo(52.0);
    expect(total).toBeCloseTo(72.0);
  });

  test('uses special_price when available', () => {
    const specialItems: MatchedItem[] = [makeItem('Bread', '15.00', '10.00', 1)];
    const { subtotal } = buildOrderSummary(specialItems);
    expect(subtotal).toBeCloseTo(10.0);
  });

  test('returns lines array', () => {
    const { lines } = buildOrderSummary(items);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Bread');
    expect(lines[0]).toContain('R15.00');
  });

  test('handles empty items', () => {
    const { subtotal, total, lines } = buildOrderSummary([]);
    expect(subtotal).toBe(0);
    expect(total).toBe(0);
    expect(lines).toHaveLength(0);
  });
});

describe('Product Service — matchProducts', () => {
  const mockProducts = [
    {
      id: 'p1',
      name: 'Bread',
      price: decimal('15.00'),
      specialPrice: null,
      aliases: ['loaf', 'mkate'],
      vendorId: 'v1',
      description: null,
      imageUrl: null,
      stockLevel: 10,
      lowStockThreshold: 5,
      isAvailable: true,
      isSpecial: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p2',
      name: 'Full Cream Milk 1L',
      price: decimal('22.00'),
      specialPrice: null,
      aliases: ['milk'],
      vendorId: 'v1',
      description: null,
      imageUrl: null,
      stockLevel: 10,
      lowStockThreshold: 5,
      isAvailable: true,
      isSpecial: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p3',
      name: 'Coca-Cola 500ml',
      price: decimal('18.00'),
      specialPrice: null,
      aliases: ['coke', 'cola'],
      vendorId: 'v1',
      description: null,
      imageUrl: null,
      stockLevel: 10,
      lowStockThreshold: 5,
      isAvailable: true,
      isSpecial: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p4',
      name: 'Pap 500g',
      price: decimal('12.00'),
      specialPrice: null,
      aliases: ['pap', 'phutu'],
      vendorId: 'v1',
      description: null,
      imageUrl: null,
      stockLevel: 10,
      lowStockThreshold: 5,
      isAvailable: true,
      isSpecial: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
  });

  test('matches exact product names', async () => {
    const parsedItems = [{ quantity: 1, name: 'bread', raw: 'bread' }];
    const { matched, ambiguous, unmatched } = await matchProducts(
      'vendor1',
      parsedItems
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].product.name).toBe('Bread');
    expect(ambiguous).toHaveLength(0);
    expect(unmatched).toHaveLength(0);
  });

  test('matches by alias', async () => {
    const parsedItems = [{ quantity: 2, name: 'coke', raw: 'coke' }];
    const { matched } = await matchProducts('vendor1', parsedItems);
    expect(matched).toHaveLength(1);
    expect(matched[0].product.name).toBe('Coca-Cola 500ml');
    expect(matched[0].quantity).toBe(2);
  });

  test('returns unmatched for unknown products', async () => {
    const parsedItems = [{ quantity: 1, name: 'xyzzy', raw: 'xyzzy' }];
    const { matched, unmatched } = await matchProducts('vendor1', parsedItems);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  test('returns empty arrays for empty vendor catalogue', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValueOnce([]);
    const parsedItems = [{ quantity: 1, name: 'bread', raw: 'bread' }];
    const { matched, unmatched } = await matchProducts('vendor1', parsedItems);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  test('handles multiple items', async () => {
    const parsedItems = [
      { quantity: 2, name: 'bread', raw: 'bread' },
      { quantity: 1, name: 'milk', raw: 'milk' },
      { quantity: 3, name: 'pap', raw: 'pap' },
    ];
    const { matched, unmatched } = await matchProducts('vendor1', parsedItems);
    expect(matched.length + unmatched.length).toBeGreaterThanOrEqual(2);
  });
});
