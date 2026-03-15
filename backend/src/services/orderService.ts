import * as db from '../db';
import logger from '../config/logger';
import { publishEvent } from '../kafka/producer';
import config from '../config';
import type {
  CustomerRow,
  OrderRow,
  CreateOrderParams,
  UpdateOrderStatusExtra,
} from '../types';

/**
 * Create or upsert a customer record.
 * @param phone
 * @param name
 */
export async function upsertCustomer(
  phone: string,
  name: string | null = null
): Promise<CustomerRow> {
  const result = await db.query<CustomerRow>(
    `INSERT INTO customers (phone, name)
     VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET name = COALESCE($2, customers.name), updated_at = NOW()
     RETURNING *`,
    [phone, name]
  );
  return result.rows[0];
}

/**
 * Get a customer by phone.
 * @param phone
 */
export async function getCustomerByPhone(
  phone: string
): Promise<CustomerRow | null> {
  const result = await db.query<CustomerRow>(
    'SELECT * FROM customers WHERE phone = $1',
    [phone]
  );
  return result.rows[0] ?? null;
}

/**
 * Get the most recent completed order for a customer (for repeat order shortcut).
 * @param customerId
 */
export async function getLastOrder(
  customerId: string
): Promise<(OrderRow & { items: unknown[] }) | null> {
  const result = await db.query<OrderRow & { items: unknown[] }>(
    `SELECT o.*,
            json_agg(
              json_build_object(
                'productId', oi.product_id,
                'quantity', oi.quantity,
                'unitPrice', oi.unit_price,
                'productName', p.name
              )
            ) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.customer_id = $1
       AND o.status IN ('ready', 'delivered')
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT 1`,
    [customerId]
  );
  return result.rows[0] ?? null;
}

/**
 * Create a new order from the confirmed session items.
 */
export async function createOrder(params: CreateOrderParams): Promise<OrderRow> {
  const {
    vendorId,
    customerId,
    items,
    fulfilmentType = 'collection',
    deliveryAddress = null,
    deliveryFee = 0,
    subtotal = 0,
    total = 0,
  } = params;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Insert order
    const orderResult = await client.query<OrderRow>(
      `INSERT INTO orders (vendor_id, customer_id, status, fulfilment_type, delivery_address, delivery_fee, subtotal, total)
       VALUES ($1, $2, 'confirmed', $3, $4, $5, $6, $7)
       RETURNING *`,
      [vendorId, customerId, fulfilmentType, deliveryAddress, deliveryFee, subtotal, total]
    );
    const order = orderResult.rows[0];

    // Insert order items
    for (const { product, quantity } of items) {
      const unitPrice = parseFloat(
        String(product.special_price ?? product.price)
      );
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, product.id, quantity, unitPrice, unitPrice * quantity]
      );

      // Decrement stock
      await client.query(
        `UPDATE products SET stock_level = GREATEST(0, stock_level - $1) WHERE id = $2`,
        [quantity, product.id]
      );
    }

    // Update customer's last order
    await client.query(
      `UPDATE customers SET last_order_id = $1 WHERE id = $2`,
      [order.id, customerId]
    );

    await client.query('COMMIT');

    logger.info('Order created', { orderId: order.id, vendorId, customerId });

    // Publish event (non-fatal)
    await publishEvent(config.kafka.topics.orderCreated, {
      orderId: order.id,
      vendorId,
      customerId,
      status: 'confirmed',
    }).catch((err: Error) =>
      logger.warn('Failed to publish order.created event', { error: err.message })
    );

    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to create order', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get orders for a vendor (for the dashboard kanban board).
 *
 * @param vendorId
 * @param statuses  Filter by status array
 */
export async function getVendorOrders(
  vendorId: string,
  statuses: string[] = ['confirmed', 'preparing', 'ready']
): Promise<OrderRow[]> {
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
     WHERE o.vendor_id = $1
       AND o.status = ANY($2)
     GROUP BY o.id, c.phone, c.name
     ORDER BY o.created_at DESC`,
    [vendorId, statuses]
  );
  return result.rows;
}

/**
 * Update order status.
 *
 * @param orderId
 * @param newStatus  One of: confirmed, preparing, ready, delivered, cancelled
 * @param extra      Additional fields to update
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
  extra: UpdateOrderStatusExtra = {}
): Promise<OrderRow> {
  const fields: string[] = ['status = $2'];
  const values: unknown[] = [orderId, newStatus];

  if (extra.queuePosition !== undefined) {
    values.push(extra.queuePosition);
    fields.push(`queue_position = $${values.length}`);
  }
  if (extra.estimatedReadyTime !== undefined) {
    values.push(extra.estimatedReadyTime);
    fields.push(`estimated_ready_time = $${values.length}`);
  }

  const result = await db.query<OrderRow>(
    `UPDATE orders SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    throw new Error(`Order ${orderId} not found`);
  }

  const order = result.rows[0];

  // Publish event (non-fatal)
  await publishEvent(config.kafka.topics.orderUpdated, {
    orderId,
    status: newStatus,
    customerId: order.customer_id,
    vendorId: order.vendor_id,
  }).catch((err: Error) =>
    logger.warn('Failed to publish order.updated event', { error: err.message })
  );

  if (newStatus === 'ready') {
    await publishEvent(config.kafka.topics.orderReady, {
      orderId,
      customerId: order.customer_id,
      vendorId: order.vendor_id,
    }).catch((err: Error) =>
      logger.warn('Failed to publish order.ready event', { error: err.message })
    );
  }

  return order;
}

/**
 * Get next queue position for a food vendor (count of 'confirmed' + 'preparing' orders).
 * @param vendorId
 */
export async function getNextQueuePosition(vendorId: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM orders WHERE vendor_id = $1 AND status IN ('confirmed', 'preparing')`,
    [vendorId]
  );
  return parseInt(result.rows[0].count, 10) + 1;
}

/**
 * Estimate ready time for a food vendor order.
 * Base: 15 minutes + 5 minutes per order ahead in queue.
 * @param queuePosition
 */
export function estimateReadyTime(queuePosition: number): Date {
  const BASE_MINUTES = 15;
  const PER_ORDER_MINUTES = 5;
  const totalMinutes = BASE_MINUTES + (queuePosition - 1) * PER_ORDER_MINUTES;
  return new Date(Date.now() + totalMinutes * 60 * 1000);
}
