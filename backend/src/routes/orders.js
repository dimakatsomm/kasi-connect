'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const orderService = require('../services/orderService');
const { publishEvent } = require('../kafka/producer');
const config = require('../config');
const logger = require('../config/logger');

const router = express.Router();

/**
 * GET /api/orders?vendorId=...&status=...
 * List orders for a vendor (dashboard kanban board).
 */
router.get('/', async (req, res) => {
  const { vendorId, status } = req.query;

  if (!vendorId) {
    return res.status(400).json({ error: 'vendorId is required' });
  }

  const statuses = status
    ? status.split(',')
    : ['confirmed', 'preparing', 'ready'];

  try {
    const orders = await orderService.getVendorOrders(vendorId, statuses);
    return res.json({ orders });
  } catch (err) {
    logger.error('Failed to list orders', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/orders/:id
 * Get a single order by ID.
 */
router.get('/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await db.query(
      `SELECT o.*,
              c.phone AS customer_phone,
              c.name  AS customer_name,
              json_agg(
                json_build_object(
                  'productId', oi.product_id,
                  'productName', p.name,
                  'quantity', oi.quantity,
                  'unitPrice', oi.unit_price,
                  'totalPrice', oi.total_price
                ) ORDER BY p.name
              ) AS items
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.id = $1
       GROUP BY o.id, c.phone, c.name`,
      [req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ order: result.rows[0] });
  } catch (err) {
    logger.error('Failed to get order', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/orders/:id/status
 * Update order status (used by the vendor dashboard).
 */
router.patch(
  '/:id/status',
  param('id').isUUID(),
  body('status').isIn(['confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status } = req.body;

    try {
      const order = await orderService.updateOrderStatus(req.params.id, status);
      return res.json({ order });
    } catch (err) {
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      logger.error('Failed to update order status', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
