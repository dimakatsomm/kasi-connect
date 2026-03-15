import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import * as db from '../db';
import * as orderService from '../services/orderService';
import logger from '../config/logger';
import type { OrderRow } from '../types';

const router = Router();

/**
 * GET /api/orders?vendorId=...&status=...
 * List orders for a vendor (dashboard kanban board).
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const vendorId = req.query.vendorId as string | undefined;

  if (!vendorId) {
    res.status(400).json({ error: 'vendorId is required' });
    return;
  }

  const statusParam = req.query.status as string | undefined;
  const statuses = statusParam
    ? statusParam.split(',')
    : ['confirmed', 'preparing', 'ready'];

  try {
    const orders = await orderService.getVendorOrders(vendorId, statuses);
    res.json({ orders });
  } catch (err) {
    logger.error('Failed to list orders', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/orders/:id
 * Get a single order by ID.
 */
router.get(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const result = await db.query<OrderRow>(
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
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      res.json({ order: result.rows[0] });
    } catch (err) {
      logger.error('Failed to get order', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/orders/:id/status
 * Update order status (used by the vendor dashboard).
 */
router.patch(
  '/:id/status',
  param('id').isUUID(),
  body('status').isIn([
    'confirmed',
    'preparing',
    'ready',
    'delivered',
    'cancelled',
  ]),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { status } = req.body as { status: string };

    try {
      const order = await orderService.updateOrderStatus(String(req.params.id), status);
      res.json({ order });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      logger.error('Failed to update order status', { error: message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
