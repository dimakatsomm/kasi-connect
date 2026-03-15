import { Prisma } from '@prisma/client';
import prisma from '../db';
import logger from '../config/logger';
import { publishEvent } from '../kafka/producer';
import config from '../config';
import { decimalToNumber } from '../utils/prisma';
import type {
  CustomerRow,
  OrderRow,
  CreateOrderParams,
  UpdateOrderStatusExtra,
  LastOrderItem,
  OrderStatus,
} from '../types';

type NormalizedOrderRow = Omit<OrderRow, 'subtotal' | 'delivery_fee' | 'total'> & {
  subtotal: number;
  delivery_fee: number;
  total: number;
};

type OrderWithItems = NormalizedOrderRow & {
  customer_phone: string;
  customer_name: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
};

/**
 * Create or upsert a customer record.
 * @param phone
 * @param name
 */
export async function upsertCustomer(
  phone: string,
  name: string | null = null
): Promise<CustomerRow> {
  return prisma.customer.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name },
  });
}

/**
 * Get a customer by phone.
 * @param phone
 */
export function getCustomerByPhone(phone: string): Promise<CustomerRow | null> {
  return prisma.customer.findUnique({ where: { phone } });
}

/**
 * Get the most recent completed order for a customer (for repeat order shortcut).
 * @param customerId
 */
export async function getLastOrder(
  customerId: string
): Promise<(NormalizedOrderRow & { items: LastOrderItem[] }) | null> {
  const order = await prisma.order.findFirst({
    where: {
      customer_id: customerId,
      status: { in: ['ready', 'delivered'] },
    },
    orderBy: { created_at: 'desc' },
    include: {
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

  if (!order) return null;

  const { order_items, ...orderData } = order;
  const items: LastOrderItem[] = order_items.map((item): LastOrderItem => ({
    productId: item.product_id,
    quantity: item.quantity,
    unitPrice: decimalToNumber(item.unit_price),
    productName: item.product?.name ?? '',
  }));

  return {
    ...orderData,
    subtotal: decimalToNumber(orderData.subtotal),
    delivery_fee: decimalToNumber(orderData.delivery_fee),
    total: decimalToNumber(orderData.total),
    items,
  };
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

  try {
    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
      let queuePosition: number | null = null;
      if (vendor.type === 'food') {
        const activeCount = await tx.order.count({
          where: {
            vendor_id: vendorId,
            status: { in: ['confirmed', 'preparing'] },
          },
        });
        queuePosition = activeCount + 1;
      }

      const createdOrder = await tx.order.create({
        data: {
          vendor_id: vendorId,
          customer_id: customerId,
          status: 'confirmed',
          fulfilment_type: fulfilmentType,
          delivery_address: deliveryAddress,
          delivery_fee: deliveryFee,
          subtotal,
          total,
          queue_position: queuePosition,
        },
      });

      for (const { product, quantity } of items) {
        const unitPrice = decimalToNumber(product.special_price ?? product.price);
        await tx.orderItem.create({
          data: {
            order_id: createdOrder.id,
            product_id: product.id,
            quantity,
            unit_price: unitPrice,
            total_price: unitPrice * quantity,
          },
        });

        const affectedRows = await tx.$executeRaw`
          UPDATE products
          SET stock_level = stock_level - ${quantity}
          WHERE id = ${product.id}
            AND stock_level >= ${quantity}
        `;
        if (affectedRows !== 1) {
          throw new Error(`Insufficient stock for product ${product.id}`);
        }
      }

      await tx.customer.update({
        where: { id: customerId },
        data: { last_order_id: createdOrder.id },
      });

      return createdOrder;
    });

    logger.info('Order created', { orderId: order.id, vendorId, customerId });

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
    logger.error('Failed to create order', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

const VALID_ORDER_STATUSES: ReadonlySet<string> = new Set<OrderStatus>([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
]);

/**
 * Get orders for a vendor (for the dashboard kanban board).
 *
 * @param vendorId
 * @param statuses  Filter by status array
 * @throws {Error} if any of the provided statuses is not a valid OrderStatus
 */
export async function getVendorOrders(
  vendorId: string,
  statuses: string[] = ['confirmed', 'preparing', 'ready']
): Promise<OrderWithItems[]> {
  const invalid = statuses.filter((s) => !VALID_ORDER_STATUSES.has(s));
  if (invalid.length > 0) {
    throw Object.assign(new Error(`Invalid order status values: ${invalid.join(', ')}`), {
      statusCode: 400,
    });
  }

  const statusFilter = statuses as OrderStatus[];

  const orders = await prisma.order.findMany({
    where: {
      vendor_id: vendorId,
      status: { in: statusFilter },
    },
    orderBy: { created_at: 'desc' },
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

  return orders.map((order): OrderWithItems => {
    const { customer, order_items, ...orderData } = order;
    const items = order_items.map((item): OrderWithItems['items'][number] => ({
      productId: item.product_id,
      productName: item.product?.name ?? '',
      quantity: item.quantity,
      unitPrice: decimalToNumber(item.unit_price),
      totalPrice: decimalToNumber(item.total_price),
    }));

    return {
      ...orderData,
      subtotal: decimalToNumber(orderData.subtotal),
      delivery_fee: decimalToNumber(orderData.delivery_fee),
      total: decimalToNumber(orderData.total),
      customer_phone: customer?.phone ?? '',
      customer_name: customer?.name ?? null,
      items,
    };
  });
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
  newStatus: OrderStatus,
  extra: UpdateOrderStatusExtra = {}
): Promise<OrderRow> {
  try {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        queue_position:
          extra.queuePosition !== undefined
            ? extra.queuePosition
            : undefined,
        estimated_ready_time: extra.estimatedReadyTime,
        updated_at: new Date(),
      },
    });

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
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      throw new Error(`Order ${orderId} not found`);
    }
    throw err;
  }
}

/**
 * Get next queue position for a food vendor (count of 'confirmed' + 'preparing' orders).
 * @param vendorId
 * @param tx  Optional Prisma transaction client; uses the global client when omitted.
 */
export async function getNextQueuePosition(
  vendorId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? prisma;
  const count = await client.order.count({
    where: {
      vendor_id: vendorId,
      status: { in: ['confirmed', 'preparing'] },
    },
  });
  return count + 1;
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
