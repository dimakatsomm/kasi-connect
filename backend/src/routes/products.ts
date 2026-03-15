import { Router, Request, Response } from 'express';
import multer from 'multer';
import { body, param, validationResult } from 'express-validator';
import * as db from '../db';
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
    const result = await db.query<ProductRow>(
      `SELECT * FROM products WHERE vendor_id = $1 ORDER BY name`,
      [vendorId]
    );
    res.json({ products: result.rows });
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
      const result = await db.query<ProductRow>(
        `INSERT INTO products (vendor_id, name, description, price, image_url, stock_level, low_stock_threshold, aliases)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          vendorId,
          name,
          description,
          price,
          imageUrl,
          stockLevel,
          lowStockThreshold,
          aliasesArray,
        ]
      );
      res.status(201).json({ product: result.rows[0] });
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
      'stock_level',
      'low_stock_threshold',
      'is_available',
      'is_special',
      'special_price',
      'aliases',
    ];
    const updates: string[] = [];
    const values: unknown[] = [req.params.id];

    const bodyData = req.body as Record<string, unknown>;

    for (const field of allowed) {
      const camelKey = field.replace(/_([a-z])/g, (_, c: string) =>
        c.toUpperCase()
      );
      if (bodyData[camelKey] !== undefined || bodyData[field] !== undefined) {
        const val = bodyData[camelKey] ?? bodyData[field];
        values.push(
          field === 'aliases'
            ? Array.isArray(val)
              ? val
              : String(val)
                  .split(',')
                  .map((a) => a.trim())
            : val
        );
        updates.push(`${field} = $${values.length}`);
      }
    }

    if (req.file) {
      const imageUrl = `/uploads/${req.file.originalname}`;
      values.push(imageUrl);
      updates.push(`image_url = $${values.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    try {
      const result = await db.query<ProductRow>(
        `UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }

      const product = result.rows[0];
      if (
        product.stock_level !== null &&
        product.stock_level <= product.low_stock_threshold
      ) {
        logger.warn('Low stock alert', {
          productId: product.id,
          name: product.name,
          stockLevel: product.stock_level,
        });
      }

      res.json({ product });
    } catch (err) {
      logger.error('Failed to update product', {
        error: err instanceof Error ? err.message : String(err),
      });
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
      await db.query(
        `UPDATE products SET is_available = FALSE WHERE id = $1`,
        [req.params.id]
      );
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
      await db.query(
        `UPDATE products SET is_special = TRUE WHERE id = $1`,
        [productId]
      );

      const result = await db.query<{ id: string }>(
        `INSERT INTO daily_specials (vendor_id, product_id, message) VALUES ($1, $2, $3) RETURNING *`,
        [vendorId, productId, message]
      );

      await publishEvent(config.kafka.topics.specialsBroadcast, {
        vendorId,
        productId,
        message,
        specialId: result.rows[0].id,
      });

      res.status(201).json({ special: result.rows[0] });
    } catch (err) {
      logger.error('Failed to publish daily special', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
