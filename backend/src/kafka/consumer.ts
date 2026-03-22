import { Kafka, Consumer, logLevel } from 'kafkajs';
import config from '../config';
import logger from '../config/logger';
import * as whatsappService from '../services/whatsappService';
import prisma from '../db';

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
    topic: config.kafka.topics.orderReady,
    fromBeginning: false,
  });

  await consumer.subscribe({
    topic: config.kafka.topics.specialsBroadcast,
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
        fulfilment_type: true,
        customer: {
          select: { phone: true },
        },
      },
    });
    if (!order?.customer?.phone) return;

    const { phone } = order.customer;
    const fulfilmentType = order.fulfilment_type;
    const collectMsg =
      fulfilmentType === 'delivery'
        ? 'Your order is ready and will be delivered shortly! 🛵'
        : 'Your order is ready for collection! Come pick it up 🎉';

    await whatsappService.sendTextMessage(
      phone,
      `✅ *Order Ready!*\n\n${collectMsg}`
    );
    logger.info('Order ready notification sent', { orderId, phone });
  } catch (err) {
    logger.error('Failed to send order ready notification', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Broadcast a daily special to all active subscribers of the vendor.
 */
async function handleSpecialsBroadcast({
  message,
  vendorId,
}: {
  message: string;
  vendorId: string;
}): Promise<void> {
  try {
    const subscribers = await prisma.vendorSubscription.findMany({
      where: {
        vendor_id: vendorId,
        is_active: true,
      },
      select: { customer: { select: { phone: true } } },
    });

    for (const sub of subscribers) {
      await whatsappService
        .sendTextMessage(
          sub.customer.phone,
          `🌟 *Daily Special!*\n\n${message}\n\n_Reply STOP to unsubscribe._`
        )
        .catch((err: Error) =>
          logger.warn('Failed to send special to subscriber', {
            phone: sub.customer.phone,
            error: err.message,
          })
        );
    }

    logger.info('Specials broadcast sent', {
      vendorId,
      count: subscribers.length,
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
