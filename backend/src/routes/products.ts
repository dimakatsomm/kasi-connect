import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { body, param, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { publishEvent } from '../kafka/producer';
import config from '../config';
import logger from '../config/logger';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* directory may be pre-created in Docker */ }

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const unique = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname);
      cb(null, `${unique}${ext}`);
    },
  }),
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
      where: { vendor_id: vendorId },
      orderBy: { name: 'asc' },
    });
    res.json({ products });
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
      stockLevel,
      lowStockThreshold,
      aliases,
      subCategoryId,
    } = req.body as {
      vendorId: string;
      name: string;
      price: string;
      description?: string;
      stockLevel?: string | number;
      lowStockThreshold?: string | number;
      aliases?: string | string[];
      subCategoryId?: string;
    };

    let imageUrl: string | null = null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const aliasesArray: string[] = aliases
      ? Array.isArray(aliases)
        ? aliases
        : aliases.split(',').map((a) => a.trim())
      : [];

    const priceNum = parseFloat(String(price));
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      res.status(400).json({ error: 'price must be a valid non-negative number' });
      return;
    }

    const stockLevelInt = parseInt(String(stockLevel ?? 0), 10);
    const lowStockThresholdInt = parseInt(String(lowStockThreshold ?? 5), 10);

    try {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor) {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }

      const product = await prisma.product.create({
        data: {
          vendor_id: vendorId,
          sub_category_id: subCategoryId || null,
          name,
          description,
          price: priceNum,
          image_url: imageUrl,
          stock_level: Number.isFinite(stockLevelInt) ? stockLevelInt : 0,
          low_stock_threshold: Number.isFinite(lowStockThresholdInt) ? lowStockThresholdInt : 5,
          aliases: aliasesArray,
        },
      });
      res.status(201).json({ product });
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

    const bodyData = req.body as Record<string, unknown>;
    const data: Prisma.ProductUpdateInput = {};

    const toCamel = (value: string): string =>
      value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

    const readField = (field: string): unknown =>
      bodyData[toCamel(field)] ?? bodyData[field];

    const maybeAssign = <K extends keyof Prisma.ProductUpdateInput>(
      field: K
    ): string | null => {
      const value = readField(field as string);
      if (value === undefined) return null;

      if (field === 'aliases') {
        data.aliases = Array.isArray(value)
          ? (value as string[])
          : String(value)
              .split(',')
              .map((a) => a.trim());
        return null;
      }

      if (field === 'stock_level' || field === 'low_stock_threshold') {
        const str = String(value).trim();
        if (!/^\d+$/.test(str)) {
          return `${String(field)} must be a non-negative integer`;
        }
        data[field] = parseInt(str, 10) as Prisma.ProductUpdateInput[K];
        return null;
      }

      if (field === 'is_available' || field === 'is_special') {
        const strVal = String(value).toLowerCase().trim();
        if (!['true', 'false', '1', '0'].includes(strVal)) {
          return `${String(field)} must be true, false, 1, or 0`;
        }
        data[field] = (strVal === 'true' || strVal === '1') as Prisma.ProductUpdateInput[K];
        return null;
      }

      if (field === 'price' || field === 'special_price') {
        const str = String(value).trim();
        const num = Number(str);
        if (str === '' || !Number.isFinite(num) || num < 0) {
          return `${String(field)} must be a valid non-negative number`;
        }
        data[field] = num as Prisma.ProductUpdateInput[K];
        return null;
      }

      data[field] = value as Prisma.ProductUpdateInput[K];
      return null;
    };

    // Handle sub_category_id separately (UUID or null)
    const subCatVal = readField('sub_category_id') as string | undefined;
    if (subCatVal !== undefined) {
      data.sub_category = subCatVal
        ? { connect: { id: subCatVal } }
        : { disconnect: true };
    }

    const fieldErrors: string[] = [
      maybeAssign('name'),
      maybeAssign('description'),
      maybeAssign('price'),
      maybeAssign('stock_level'),
      maybeAssign('low_stock_threshold'),
      maybeAssign('is_available'),
      maybeAssign('is_special'),
      maybeAssign('special_price'),
      maybeAssign('aliases'),
    ].filter((e): e is string => e !== null);

    if (fieldErrors.length > 0) {
      res.status(400).json({ errors: fieldErrors });
      return;
    }

    if (req.file) {
      data.image_url = `/uploads/${req.file.filename}`;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    try {
      const product = await prisma.product.update({
        where: { id: req.params.id },
        data,
      });

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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
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
      await prisma.product.update({
        where: { id: req.params.id },
        data: { is_available: false },
      });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
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
      const special = await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId, vendor_id: vendorId },
          data: { is_special: true },
        });

        return tx.dailySpecial.create({
          data: { vendor_id: vendorId, product_id: productId, message },
        });
      });

      await publishEvent(config.kafka.topics.specialsBroadcast, {
        vendorId,
        productId,
        message,
        specialId: special.id,
      });

      res.status(201).json({ special });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') {
          res.status(404).json({ error: 'Product not found or does not belong to this vendor' });
          return;
        }
        if (err.code === 'P2003') {
          res.status(400).json({ error: 'Invalid product or vendor ID' });
          return;
        }
      }
      logger.error('Failed to publish daily special', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
