import { prisma } from '../db';
import logger from '../config/logger';
import { publishEvent } from '../kafka/producer';
import config from '../config';
import type {
  CustomerRow,
  OrderRow,
  CreateOrderParams,
  UpdateOrderStatusExtra,
} from '../types';
import { Prisma, OrderStatus } from '../generated/prisma';

/**
 * Create or upsert a customer record.
 * @param phone
 * @param name
 */
export async function upsertCustomer(
  phone: string,
  name: string | null = null
): Promise<CustomerRow> {
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: {
      name: name ?? undefined,
    },
    create: {
      phone,
      name,
    },
  });

  // Convert Prisma result to CustomerRow format
  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    last_order_id: customer.lastOrderId,
    created_at: customer.createdAt.toISOString(),
    updated_at: customer.updatedAt.toISOString(),
  };
}

/**
 * Get a customer by phone.
 * @param phone
 */
export async function getCustomerByPhone(
  phone: string
): Promise<CustomerRow | null> {
  const customer = await prisma.customer.findUnique({
    where: { phone },
  });

  if (!customer) {
    return null;
  }

  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    last_order_id: customer.lastOrderId,
    created_at: customer.createdAt.toISOString(),
    updated_at: customer.updatedAt.toISOString(),
  };
}

/**
 * Get the most recent completed order for a customer (for repeat order shortcut).
 * @param customerId
 */
export async function getLastOrder(
  customerId: string
): Promise<(OrderRow & { items: unknown[] }) | null> {
  const order = await prisma.order.findFirst({
    where: {
      customerId,
      status: { in: [OrderStatus.ready, OrderStatus.delivered] },
    },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!order) {
    return null;
  }

  // Map to expected format
  const items = order.orderItems.map((oi) => ({
    productId: oi.productId,
    quantity: oi.quantity,
    unitPrice: oi.unitPrice.toNumber(),
    productName: oi.product.name,
  }));

  return {
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
    items,
  } as OrderRow & { items: unknown[] };
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
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          vendorId,
          customerId,
          status: OrderStatus.confirmed,
          fulfilmentType,
          deliveryAddress,
          deliveryFee,
          subtotal,
          total,
        },
      });

      // Create order items and update stock
      for (const { product, quantity } of items) {
        const unitPrice = parseFloat(
          String(product.special_price ?? product.price)
        );

        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: product.id,
            quantity,
            unitPrice,
            totalPrice: unitPrice * quantity,
          },
        });

        // Decrement stock
        const currentProduct = await tx.product.findUnique({
          where: { id: product.id },
          select: { stockLevel: true },
        });

        if (!currentProduct || currentProduct.stockLevel < quantity) {
          throw new Error(
            `Insufficient stock for product ${product.id}. Available: ${currentProduct?.stockLevel ?? 0}, Requested: ${quantity}`
          );
        }

        await tx.product.update({
          where: { id: product.id },
          data: {
            stockLevel: {
              decrement: quantity,
            },
          },
        });
      }

      // Update customer's last order
      await tx.customer.update({
        where: { id: customerId },
        data: { lastOrderId: newOrder.id },
      });

      return newOrder;
    });

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

    // Convert to OrderRow format
    return {
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
    };
  } catch (err) {
    logger.error('Failed to create order', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
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
  statuses: OrderStatus[] = [OrderStatus.confirmed, OrderStatus.preparing, OrderStatus.ready]
): Promise<OrderRow[]> {
  const orders = await prisma.order.findMany({
    where: {
      vendorId,
      status: { in: statuses },
    },
    include: {
      customer: true,
      orderItems: {
        include: {
          product: true,
        },
        orderBy: {
          product: {
            name: 'asc',
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Map to expected format with customer info and items
  return orders.map((order) => ({
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
    items: order.orderItems.map((oi) => ({
      productId: oi.productId,
      productName: oi.product.name,
      quantity: oi.quantity,
      unitPrice: oi.unitPrice.toNumber(),
      totalPrice: oi.totalPrice.toNumber(),
    })),
  })) as OrderRow[];
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
  const updateData: Prisma.OrderUpdateInput = {
    status: newStatus,
  };

  if (extra.queuePosition !== undefined) {
    updateData.queuePosition = extra.queuePosition;
  }
  if (extra.estimatedReadyTime !== undefined) {
    updateData.estimatedReadyTime = extra.estimatedReadyTime;
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
  });

  // Publish event (non-fatal)
  await publishEvent(config.kafka.topics.orderUpdated, {
    orderId,
    status: newStatus,
    customerId: order.customerId,
    vendorId: order.vendorId,
  }).catch((err: Error) =>
    logger.warn('Failed to publish order.updated event', { error: err.message })
  );

  if (newStatus === OrderStatus.ready) {
    await publishEvent(config.kafka.topics.orderReady, {
      orderId,
      customerId: order.customerId,
      vendorId: order.vendorId,
    }).catch((err: Error) =>
      logger.warn('Failed to publish order.ready event', { error: err.message })
    );
  }

  return {
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
  };
}

/**
 * Get next queue position for a food vendor (count of 'confirmed' + 'preparing' orders).
 * @param vendorId
 */
export async function getNextQueuePosition(vendorId: string): Promise<number> {
  const count = await prisma.order.count({
    where: {
      vendorId,
      status: { in: [OrderStatus.confirmed, OrderStatus.preparing] },
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
