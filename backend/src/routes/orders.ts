import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import prisma from '../db';
import * as orderService from '../services/orderService';
import logger from '../config/logger';
import { decimalToNumber } from '../utils/prisma';
import type { OrderRow, OrderStatus } from '../types';

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
    ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
    : ['confirmed', 'preparing', 'ready'];

  try {
    const orders = await orderService.getVendorOrders(vendorId, statuses);
    res.json({ orders });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 400) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Bad request' });
      return;
    }
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
      const order = await prisma.order.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            select: {
              phone: true,
              name: true,
            },
          },
          order_items: {
            include: {
              product: {
                select: { name: true },
              },
            },
            orderBy: { created_at: 'asc' },
          },
        },
      });

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const { customer, order_items, ...orderData } = order;

      const enrichedOrder: OrderRow & {
        customer_phone: string;
        customer_name: string | null;
        items: Array<{
          productId: string;
          productName: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
        }>;
      } = {
        ...(orderData as OrderRow),
        customer_phone: customer?.phone ?? '',
        customer_name: customer?.name ?? null,
        items: order_items.map(
          (item): {
            productId: string;
            productName: string;
            quantity: number;
            unitPrice: number;
            totalPrice: number;
          } => ({
            productId: item.product_id,
            productName: item.product?.name ?? '',
            quantity: item.quantity,
            unitPrice: decimalToNumber(item.unit_price),
            totalPrice: decimalToNumber(item.total_price),
          })
        ),
      };

      res.json({ order: enrichedOrder });
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

    const { status } = req.body as { status: OrderStatus };

    try {
      const order = await orderService.updateOrderStatus(
        String(req.params.id),
        status
      );
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
