import Fuse, { IFuseOptions } from 'fuse.js';
import prisma from '../db';
import logger from '../config/logger';
import { decimalToNumber } from '../utils/prisma';
import { detectCategories } from './nlpService';
import type {
  ProductRow,
  ParsedItem,
  MatchedItem,
  AmbiguousItem,
  UnmatchedItem,
  MatchProductsResult,
  OrderSummary,
  CategoryKeywordEntry,
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
 * Load all available products for a vendor from the database,
 * including sub-category and category relations.
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
    include: {
      sub_category: {
        include: { category: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Load all category keyword entries for NLP detection. Cached at process-level
 * since categories are admin-managed and rarely change.
 */
let _cachedEntries: CategoryKeywordEntry[] | null = null;

export async function getCategoryKeywordEntries(): Promise<CategoryKeywordEntry[]> {
  if (_cachedEntries) return _cachedEntries;

  const categories = await prisma.category.findMany({
    include: { sub_categories: true },
  });

  const entries: CategoryKeywordEntry[] = [];
  for (const cat of categories) {
    // Category-level keywords
    if (cat.keywords.length > 0) {
      entries.push({
        categoryId: cat.id,
        subCategoryId: null,
        keywords: cat.keywords,
      });
    }
    // Sub-category-level keywords
    for (const sub of cat.sub_categories) {
      if (sub.keywords.length > 0) {
        entries.push({
          categoryId: cat.id,
          subCategoryId: sub.id,
          keywords: sub.keywords,
        });
      }
    }
  }

  _cachedEntries = entries;
  return entries;
}

/** Clear the cached category keyword entries (useful for tests). */
export function clearCategoryCache(): void {
  _cachedEntries = null;
}

/**
 * Match a list of parsed order items against the vendor's product catalogue.
 * Uses category-scoped search when category keywords are detected in the
 * original order text, falling back to full-catalogue search.
 *
 * @param vendorId
 * @param parsedItems
 * @param orderText  Optional raw order text for category detection
 */
export async function matchProducts(
  vendorId: string,
  parsedItems: ParsedItem[],
  orderText?: string
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

  // Build Fuse index for full catalogue
  const searchableProducts: SearchableProduct[] = products.map((product) => ({
    ...product,
    aliases: product.aliases ?? [],
  }));
  const fullFuse = new Fuse(searchableProducts, FUSE_OPTIONS);

  // Detect category scoping if orderText is provided
  let detectedSubCategoryIds: string[] = [];
  if (orderText) {
    const entries = await getCategoryKeywordEntries();
    detectedSubCategoryIds = detectCategories(orderText, entries);
  }

  // Build a scoped Fuse index if we detected any categories
  let scopedFuse: Fuse<SearchableProduct> | null = null;
  if (detectedSubCategoryIds.length > 0) {
    const scopedProducts = searchableProducts.filter(
      (p) => p.sub_category_id && detectedSubCategoryIds.includes(p.sub_category_id)
    );
    if (scopedProducts.length > 0) {
      scopedFuse = new Fuse(scopedProducts, FUSE_OPTIONS);
    }
  }

  const matched: MatchedItem[] = [];
  const ambiguous: AmbiguousItem[] = [];
  const unmatched: UnmatchedItem[] = [];

  for (const item of parsedItems) {
    // Try scoped search first, then fall back to full catalogue
    let searchResults = scopedFuse ? scopedFuse.search(item.name) : [];
    if (searchResults.length === 0) {
      searchResults = fullFuse.search(item.name);
    }

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
