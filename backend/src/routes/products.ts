import { Router, Request, Response } from 'express';
import multer from 'multer';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../db';
import { publishEvent } from '../kafka/producer';
import config from '../config';
import logger from '../config/logger';
import type { ProductRow } from '../types';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * GET /api/products?vendorId=...
 * List products for a vendor.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const vendorId = req.query.vendorId as string | undefined;
  if (!vendorId) {
    res.status(400).json({ error: 'vendorId is required' });
    return;
  }

  try {
    const products = await prisma.product.findMany({
      where: { vendorId },
      orderBy: { name: 'asc' },
    });

    // Convert to snake_case format for backward compatibility
    const productsResponse: ProductRow[] = products.map((p) => ({
      id: p.id,
      vendor_id: p.vendorId,
      name: p.name,
      description: p.description,
      price: p.price.toNumber(),
      image_url: p.imageUrl,
      stock_level: p.stockLevel,
      low_stock_threshold: p.lowStockThreshold,
      is_available: p.isAvailable,
      is_special: p.isSpecial,
      special_price: p.specialPrice?.toNumber() ?? null,
      aliases: p.aliases,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt.toISOString(),
    }));

    res.json({ products: productsResponse });
  } catch (err) {
    logger.error('Failed to list products', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/products
 * Create a new product / menu item.
 */
router.post(
  '/',
  upload.single('image'),
  [
    body('vendorId').isUUID(),
    body('name').notEmpty().trim(),
    body('price').isFloat({ min: 0 }),
    body('stockLevel').optional().isInt({ min: 0 }),
    body('lowStockThreshold').optional().isInt({ min: 0 }),
    body('aliases').optional(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const {
      vendorId,
      name,
      price,
      description,
      stockLevel = 0,
      lowStockThreshold = 5,
      aliases,
    } = req.body as {
      vendorId: string;
      name: string;
      price: string;
      description?: string;
      stockLevel?: number;
      lowStockThreshold?: number;
      aliases?: string | string[];
    };

    let imageUrl: string | null = null;
    if (req.file) {
      // In production, upload to Huawei OBS here
      imageUrl = `/uploads/${req.file.originalname}`;
    }

    const aliasesArray: string[] = aliases
      ? Array.isArray(aliases)
        ? aliases
        : aliases.split(',').map((a) => a.trim())
      : [];

    try {
      const product = await prisma.product.create({
        data: {
          vendorId,
          name,
          description,
          price,
          imageUrl,
          stockLevel,
          lowStockThreshold,
          aliases: aliasesArray,
        },
      });

      const productResponse: ProductRow = {
        id: product.id,
        vendor_id: product.vendorId,
        name: product.name,
        description: product.description,
        price: product.price.toNumber(),
        image_url: product.imageUrl,
        stock_level: product.stockLevel,
        low_stock_threshold: product.lowStockThreshold,
        is_available: product.isAvailable,
        is_special: product.isSpecial,
        special_price: product.specialPrice?.toNumber() ?? null,
        aliases: product.aliases,
        created_at: product.createdAt.toISOString(),
        updated_at: product.updatedAt.toISOString(),
      };

      res.status(201).json({ product: productResponse });
    } catch (err) {
      logger.error('Failed to create product', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/products/:id
 * Update product details or stock level.
 */
router.patch(
  '/:id',
  upload.single('image'),
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const allowed = [
      'name',
      'description',
      'price',
      'stockLevel',
      'lowStockThreshold',
      'isAvailable',
      'isSpecial',
      'specialPrice',
      'aliases',
    ];
    const updates: Record<string, unknown> = {};
    const bodyData = req.body as Record<string, unknown>;

    for (const field of allowed) {
      const snakeKey = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      if (bodyData[field] !== undefined || bodyData[snakeKey] !== undefined) {
        const val = bodyData[field] ?? bodyData[snakeKey];
        updates[field] =
          field === 'aliases'
            ? Array.isArray(val)
              ? val
              : String(val)
                  .split(',')
                  .map((a) => a.trim())
            : val;
      }
    }

    if (req.file) {
      const imageUrl = `/uploads/${req.file.originalname}`;
      updates.imageUrl = imageUrl;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    try {
      const product = await prisma.product.update({
        where: { id: req.params.id },
        data: updates,
      });

      if (
        product.stockLevel !== null &&
        product.stockLevel <= product.lowStockThreshold
      ) {
        logger.warn('Low stock alert', {
          productId: product.id,
          name: product.name,
          stockLevel: product.stockLevel,
        });
      }

      const productResponse: ProductRow = {
        id: product.id,
        vendor_id: product.vendorId,
        name: product.name,
        description: product.description,
        price: product.price.toNumber(),
        image_url: product.imageUrl,
        stock_level: product.stockLevel,
        low_stock_threshold: product.lowStockThreshold,
        is_available: product.isAvailable,
        is_special: product.isSpecial,
        special_price: product.specialPrice?.toNumber() ?? null,
        aliases: product.aliases,
        created_at: product.createdAt.toISOString(),
        updated_at: product.updatedAt.toISOString(),
      };

      res.json({ product: productResponse });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Record to update not found')) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      logger.error('Failed to update product', { error: message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/products/:id
 */
router.delete(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      await prisma.product.update({
        where: { id: req.params.id },
        data: { isAvailable: false },
      });
      res.status(204).send();
    } catch (err) {
      logger.error('Failed to delete product', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/products/specials
 * Publish a daily special and trigger broadcast.
 */
router.post(
  '/specials',
  [
    body('vendorId').isUUID(),
    body('productId').isUUID(),
    body('message').notEmpty().trim(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { vendorId, productId, message } = req.body as {
      vendorId: string;
      productId: string;
      message: string;
    };

    try {
      await prisma.product.update({
        where: { id: productId },
        data: { isSpecial: true },
      });

      const dailySpecial = await prisma.dailySpecial.create({
        data: {
          vendorId,
          productId,
          message,
        },
      });

      await publishEvent(config.kafka.topics.specialsBroadcast, {
        vendorId,
        productId,
        message,
        specialId: dailySpecial.id,
      });

      res.status(201).json({ special: { id: dailySpecial.id } });
    } catch (err) {
      logger.error('Failed to publish daily special', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
