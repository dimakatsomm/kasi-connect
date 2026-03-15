import { buildOrderSummary } from '../src/services/productService';
import type { MatchedItem } from '../src/types';

// We mock the db module so matchProducts can be tested without a live database
jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

import * as db from '../src/db';
import { matchProducts } from '../src/services/productService';

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
      price: '15.00',
      special_price: null,
      aliases: ['loaf', 'mkate'],
      vendor_id: 'v1',
      description: null,
      image_url: null,
      stock_level: 10,
      low_stock_threshold: 5,
      is_available: true,
      is_special: false,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'p2',
      name: 'Full Cream Milk 1L',
      price: '22.00',
      special_price: null,
      aliases: ['milk'],
      vendor_id: 'v1',
      description: null,
      image_url: null,
      stock_level: 10,
      low_stock_threshold: 5,
      is_available: true,
      is_special: false,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'p3',
      name: 'Coca-Cola 500ml',
      price: '18.00',
      special_price: null,
      aliases: ['coke', 'cola'],
      vendor_id: 'v1',
      description: null,
      image_url: null,
      stock_level: 10,
      low_stock_threshold: 5,
      is_available: true,
      is_special: false,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'p4',
      name: 'Pap 500g',
      price: '12.00',
      special_price: null,
      aliases: ['pap', 'phutu'],
      vendor_id: 'v1',
      description: null,
      image_url: null,
      stock_level: 10,
      low_stock_threshold: 5,
      is_available: true,
      is_special: false,
      created_at: '',
      updated_at: '',
    },
  ];

  beforeEach(() => {
    (db.query as jest.Mock).mockResolvedValue({ rows: mockProducts });
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
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
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
