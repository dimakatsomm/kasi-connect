'use strict';

const { Kafka, logLevel } = require('kafkajs');
const config = require('../config');
const logger = require('../config/logger');
const whatsappService = require('../services/whatsappService');
const db = require('../db');

let consumer;

async function startConsumer() {
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
        const payload = JSON.parse(message.value.toString());
        logger.debug('Kafka message received', { topic });

        if (topic === config.kafka.topics.orderReady) {
          await handleOrderReady(payload);
        } else if (topic === config.kafka.topics.specialsBroadcast) {
          await handleSpecialsBroadcast(payload);
        }
      } catch (err) {
        logger.error('Failed to process Kafka message', { topic, error: err.message });
      }
    },
  });

  logger.info('Kafka consumer started');
}

/**
 * When an order is marked ready, notify the customer via WhatsApp.
 */
async function handleOrderReady({ orderId, customerId }) {
  try {
    const result = await db.query(
      `SELECT o.fulfilment_type, c.phone
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (!result.rows[0]) return;

    const { phone, fulfilment_type: fulfilmentType } = result.rows[0];
    const collectMsg =
      fulfilmentType === 'delivery'
        ? 'Your order is ready and will be delivered shortly! 🛵'
        : 'Your order is ready for collection! Come pick it up 🎉';

    await whatsappService.sendTextMessage(phone, `✅ *Order Ready!*\n\n${collectMsg}`);
    logger.info('Order ready notification sent', { orderId, phone });
  } catch (err) {
    logger.error('Failed to send order ready notification', { orderId, error: err.message });
  }
}

/**
 * Broadcast a daily special to all customers who ordered in the last 30 days.
 */
async function handleSpecialsBroadcast({ message, vendorId }) {
  try {
    const result = await db.query(
      `SELECT DISTINCT c.phone
       FROM customers c
       JOIN orders o ON o.customer_id = c.id
       WHERE o.vendor_id = $1
         AND o.created_at >= NOW() - INTERVAL '30 days'`,
      [vendorId]
    );

    for (const { phone } of result.rows) {
      await whatsappService
        .sendTextMessage(phone, `🌟 *Daily Special!*\n\n${message}`)
        .catch((err) =>
          logger.warn('Failed to send special to customer', { phone, error: err.message })
        );
    }

    logger.info('Specials broadcast sent', { vendorId, count: result.rows.length });
  } catch (err) {
    logger.error('Failed to broadcast special', { vendorId, error: err.message });
  }
}

async function stopConsumer() {
  if (consumer) {
    await consumer.disconnect();
    logger.info('Kafka consumer stopped');
  }
}

module.exports = { startConsumer, stopConsumer };
