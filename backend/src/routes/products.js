'use strict';

const express = require('express');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { publishEvent } = require('../kafka/producer');
const config = require('../config');
const logger = require('../config/logger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * GET /api/products?vendorId=...
 * List products for a vendor.
 */
router.get('/', async (req, res) => {
  const { vendorId } = req.query;
  if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });

  try {
    const result = await db.query(
      `SELECT * FROM products WHERE vendor_id = $1 ORDER BY name`,
      [vendorId]
    );
    return res.json({ products: result.rows });
  } catch (err) {
    logger.error('Failed to list products', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      vendorId,
      name,
      price,
      description,
      stockLevel = 0,
      lowStockThreshold = 5,
      aliases,
    } = req.body;

    let imageUrl = null;
    if (req.file) {
      // In production, upload to Huawei OBS here
      // For now, store as placeholder
      imageUrl = `/uploads/${req.file.originalname}`;
    }

    const aliasesArray = aliases
      ? Array.isArray(aliases)
        ? aliases
        : aliases.split(',').map((a) => a.trim())
      : [];

    try {
      const result = await db.query(
        `INSERT INTO products (vendor_id, name, description, price, image_url, stock_level, low_stock_threshold, aliases)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [vendorId, name, description, price, imageUrl, stockLevel, lowStockThreshold, aliasesArray]
      );
      return res.status(201).json({ product: result.rows[0] });
    } catch (err) {
      logger.error('Failed to create product', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const allowed = ['name', 'description', 'price', 'stock_level', 'low_stock_threshold',
                     'is_available', 'is_special', 'special_price', 'aliases'];
    const updates = [];
    const values = [req.params.id];

    for (const field of allowed) {
      const camelKey = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (req.body[camelKey] !== undefined || req.body[field] !== undefined) {
        const val = req.body[camelKey] ?? req.body[field];
        values.push(field === 'aliases' ? (Array.isArray(val) ? val : val.split(',').map((a) => a.trim())) : val);
        updates.push(`${field} = $${values.length}`);
      }
    }

    if (req.file) {
      const imageUrl = `/uploads/${req.file.originalname}`;
      values.push(imageUrl);
      updates.push(`image_url = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    try {
      const result = await db.query(
        `UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        values
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Check for low stock alert
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
        // In production: push notification to vendor dashboard via WebSocket / Kafka
      }

      return res.json({ product });
    } catch (err) {
      logger.error('Failed to update product', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/products/:id
 */
router.delete('/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await db.query(`UPDATE products SET is_available = FALSE WHERE id = $1`, [req.params.id]);
    return res.status(204).send();
  } catch (err) {
    logger.error('Failed to delete product', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { vendorId, productId, message } = req.body;

    try {
      // Mark product as special
      await db.query(`UPDATE products SET is_special = TRUE WHERE id = $1`, [productId]);

      // Save daily special
      const result = await db.query(
        `INSERT INTO daily_specials (vendor_id, product_id, message) VALUES ($1, $2, $3) RETURNING *`,
        [vendorId, productId, message]
      );

      // Trigger broadcast via Kafka
      await publishEvent(config.kafka.topics.specialsBroadcast, {
        vendorId,
        productId,
        message,
        specialId: result.rows[0].id,
      });

      return res.status(201).json({ special: result.rows[0] });
    } catch (err) {
      logger.error('Failed to publish daily special', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
