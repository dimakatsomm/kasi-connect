import { Kafka, Consumer, logLevel } from 'kafkajs';
import config from '../config';
import logger from '../config/logger';
import * as whatsappService from '../services/whatsappService';
import { prisma } from '../db';

let consumer: Consumer | undefined;

export async function startConsumer(): Promise<void> {
  const kafka = new Kafka({
    clientId: `${config.kafka.clientId}-consumer`,
    brokers: config.kafka.brokers,
    logLevel: logLevel.WARN,
  });

  consumer = kafka.consumer({ groupId: config.kafka.groupId });
  await consumer.connect();

  await consumer.subscribe({
    topics: [
      config.kafka.topics.orderReady,
      config.kafka.topics.specialsBroadcast,
    ],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const value = (message.value ?? '{}').toString();
        const payload = JSON.parse(value) as Record<string, unknown>;
        logger.debug('Kafka message received', { topic });

        if (topic === config.kafka.topics.orderReady) {
          await handleOrderReady(payload as { orderId: string; customerId: string });
        } else if (topic === config.kafka.topics.specialsBroadcast) {
          await handleSpecialsBroadcast(
            payload as { message: string; vendorId: string }
          );
        }
      } catch (err) {
        logger.error('Failed to process Kafka message', {
          topic,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  logger.info('Kafka consumer started');
}

/**
 * When an order is marked ready, notify the customer via WhatsApp.
 */
async function handleOrderReady({
  orderId,
}: {
  orderId: string;
  customerId: string;
}): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        fulfilmentType: true,
        customer: {
          select: {
            phone: true,
          },
        },
      },
    });

    if (!order) return;

    const collectMsg =
      order.fulfilmentType === 'delivery'
        ? 'Your order is ready and will be delivered shortly! 🛵'
        : 'Your order is ready for collection! Come pick it up 🎉';

    await whatsappService.sendTextMessage(
      order.customer.phone,
      `✅ *Order Ready!*\n\n${collectMsg}`
    );
    logger.info('Order ready notification sent', { orderId, phone: order.customer.phone });
  } catch (err) {
    logger.error('Failed to send order ready notification', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Broadcast a daily special to all customers who ordered in the last 30 days.
 */
async function handleSpecialsBroadcast({
  message,
  vendorId,
}: {
  message: string;
  vendorId: string;
}): Promise<void> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const customers = await prisma.customer.findMany({
      where: {
        orders: {
          some: {
            vendorId,
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        },
      },
      select: {
        phone: true,
      },
      distinct: ['phone'],
    });

    for (const { phone } of customers) {
      await whatsappService
        .sendTextMessage(phone, `🌟 *Daily Special!*\n\n${message}`)
        .catch((err: Error) =>
          logger.warn('Failed to send special to customer', {
            phone,
            error: err.message,
          })
        );
    }

    logger.info('Specials broadcast sent', {
      vendorId,
      count: customers.length,
    });
  } catch (err) {
    logger.error('Failed to broadcast special', {
      vendorId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    logger.info('Kafka consumer stopped');
  }
}
