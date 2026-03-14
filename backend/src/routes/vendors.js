'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const logger = require('../config/logger');

const router = express.Router();

/**
 * GET /api/vendors
 * List all active vendors.
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, type, phone, address, whatsapp_number, delivery_fee, is_active, created_at
       FROM vendors WHERE is_active = TRUE ORDER BY name`
    );
    return res.json({ vendors: result.rows });
  } catch (err) {
    logger.error('Failed to list vendors', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/vendors/:id
 */
router.get('/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await db.query('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    return res.json({ vendor: result.rows[0] });
  } catch (err) {
    logger.error('Failed to get vendor', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/vendors
 * Create a new vendor.
 */
router.post(
  '/',
  [
    body('name').notEmpty().trim(),
    body('type').isIn(['retail', 'food']),
    body('phone').notEmpty().trim(),
    body('address').optional().trim(),
    body('deliveryFee').optional().isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, type, phone, address, whatsappNumber, deliveryFee = 0 } = req.body;

    try {
      const result = await db.query(
        `INSERT INTO vendors (name, type, phone, address, whatsapp_number, delivery_fee)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, type, phone, address, whatsappNumber, deliveryFee]
      );
      return res.status(201).json({ vendor: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Phone number already registered' });
      }
      logger.error('Failed to create vendor', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/vendors/:id
 */
router.patch('/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const allowed = ['name', 'address', 'whatsapp_number', 'delivery_fee', 'is_active'];
  const updates = [];
  const values = [req.params.id];

  for (const field of allowed) {
    const camelKey = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[camelKey] !== undefined || req.body[field] !== undefined) {
      values.push(req.body[camelKey] ?? req.body[field]);
      updates.push(`${field} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const result = await db.query(
      `UPDATE vendors SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    return res.json({ vendor: result.rows[0] });
  } catch (err) {
    logger.error('Failed to update vendor', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
