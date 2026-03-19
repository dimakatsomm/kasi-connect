import Fuse, { IFuseOptions } from 'fuse.js';
import prisma from '../db';
import logger from '../config/logger';
import { decimalToNumber } from '../utils/prisma';
import type {
  ProductRow,
  ParsedItem,
  MatchedItem,
  AmbiguousItem,
  UnmatchedItem,
  MatchProductsResult,
  OrderSummary,
} from '../types';

type SearchableProduct = ProductRow & { aliases: string[] };

/**
 * Fuse.js options for fuzzy product name matching.
 * Lower threshold = stricter match.
 */
const FUSE_OPTIONS: IFuseOptions<SearchableProduct> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'aliases', weight: 0.3 },
  ],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
};

/**
 * Load all available products for a vendor from the database.
 * @param vendorId
 */
export async function getVendorProducts(
  vendorId: string
): Promise<ProductRow[]> {
  return prisma.product.findMany({
    where: {
      vendor_id: vendorId,
      is_available: true,
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Match a list of parsed order items against the vendor's product catalogue.
 *
 * @param vendorId
 * @param parsedItems
 */
export async function matchProducts(
  vendorId: string,
  parsedItems: ParsedItem[]
): Promise<MatchProductsResult> {
  const products = await getVendorProducts(vendorId);

  if (products.length === 0) {
    logger.warn('No products found for vendor', { vendorId });
    return {
      matched: [],
      ambiguous: [],
      unmatched: parsedItems.map((item) => ({ item })),
    };
  }

  // Build Fuse index
  const searchableProducts: SearchableProduct[] = products.map((product) => ({
    ...product,
    aliases: product.aliases ?? [],
  }));
  const fuse = new Fuse(searchableProducts, FUSE_OPTIONS);

  const matched: MatchedItem[] = [];
  const ambiguous: AmbiguousItem[] = [];
  const unmatched: UnmatchedItem[] = [];

  for (const item of parsedItems) {
    const searchResults = fuse.search(item.name);

    if (searchResults.length === 0) {
      unmatched.push({ item });
      continue;
    }

    // If top result score is significantly better than second result, it's a clear match
    const top = searchResults[0];
    const second = searchResults[1];

    const isAmbiguous =
      second !== undefined &&
      Math.abs((top.score ?? 0) - (second.score ?? 0)) < 0.1 &&
      (top.score ?? 0) > 0.1; // non-trivial ambiguity

    if (isAmbiguous) {
      ambiguous.push({
        item,
        candidates: searchResults.slice(0, 3).map((r) => r.item),
      });
    } else {
      matched.push({
        item,
        product: top.item,
        quantity: item.quantity,
      });
    }
  }

  return { matched, ambiguous, unmatched };
}

/**
 * Build an itemised order summary string for WhatsApp confirmation.
 * @param matchedItems
 * @param deliveryFee
 */
export function buildOrderSummary(
  matchedItems: MatchedItem[],
  deliveryFee = 0
): OrderSummary {
  let subtotal = 0;
  const lines: string[] = [];

  for (const { product, quantity } of matchedItems) {
    const unitPrice = decimalToNumber(
      product.special_price ?? product.price
    );
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    lines.push(
      `• ${quantity}x ${product.name} @ R${unitPrice.toFixed(2)} = R${lineTotal.toFixed(2)}`
    );
  }

  const total = subtotal + deliveryFee;
  return { lines, subtotal, total };
}
