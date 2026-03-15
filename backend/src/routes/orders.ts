import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../db';
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
      const order = await prisma.order.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            select: {
              phone: true,
              name: true,
            },
          },
          orderItems: {
            include: {
              product: {
                select: {
                  name: true,
                },
              },
            },
            orderBy: {
              product: {
                name: 'asc',
              },
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      // Convert to expected format with snake_case and aggregated items
      const items = order.orderItems.map((oi) => ({
        productId: oi.productId,
        productName: oi.product.name,
        quantity: oi.quantity,
        unitPrice: oi.unitPrice.toNumber(),
        totalPrice: oi.totalPrice.toNumber(),
      }));

      const orderResponse: OrderRow & {
        customer_phone: string;
        customer_name: string | null;
        items: unknown[];
      } = {
        id: order.id,
        vendor_id: order.vendorId,
        customer_id: order.customerId,
        status: order.status,
        fulfilment_type: order.fulfilmentType,
        delivery_address: order.deliveryAddress,
        delivery_fee: order.deliveryFee.toNumber(),
        subtotal: order.subtotal.toNumber(),
        total: order.total.toNumber(),
        queue_position: order.queuePosition,
        estimated_ready_time: order.estimatedReadyTime?.toISOString() ?? null,
        notes: order.notes,
        created_at: order.createdAt.toISOString(),
        updated_at: order.updatedAt.toISOString(),
        customer_phone: order.customer.phone,
        customer_name: order.customer.name,
        items,
      };

      res.json({ order: orderResponse });
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
