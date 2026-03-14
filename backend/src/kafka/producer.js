'use strict';

const { Kafka, logLevel } = require('kafkajs');
const config = require('../config');
const logger = require('../config/logger');

let kafkaClient;
let producer;
let isConnected = false;

function getKafkaClient() {
  if (!kafkaClient) {
    kafkaClient = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: logLevel.WARN,
    });
  }
  return kafkaClient;
}

async function getProducer() {
  if (!producer) {
    producer = getKafkaClient().producer();
    await producer.connect();
    isConnected = true;
    logger.info('Kafka producer connected');
  }
  return producer;
}

/**
 * Publish a JSON event to a Kafka topic.
 *
 * @param {string} topic
 * @param {object} payload
 * @param {string} [key]   Optional message key (used for partitioning)
 */
async function publishEvent(topic, payload, key = null) {
  try {
    const prod = await getProducer();
    await prod.send({
      topic,
      messages: [
        {
          key: key || payload.orderId || null,
          value: JSON.stringify(payload),
        },
      ],
    });
    logger.debug('Kafka event published', { topic, payload });
  } catch (err) {
    logger.error('Failed to publish Kafka event', { topic, error: err.message });
    // Don't throw — Kafka failures should be non-fatal for the order flow
  }
}

/**
 * Gracefully disconnect the producer.
 */
async function disconnectProducer() {
  if (producer && isConnected) {
    await producer.disconnect();
    isConnected = false;
    logger.info('Kafka producer disconnected');
  }
}

module.exports = { publishEvent, disconnectProducer, getKafkaClient };
