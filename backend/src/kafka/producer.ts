import { Kafka, Producer, logLevel } from 'kafkajs';
import config from '../config';
import logger from '../config/logger';
import type { KafkaEventPayload } from '../types';

let kafkaClient: Kafka | undefined;
let producer: Producer | undefined;
let isConnected = false;

function getKafkaClient(): Kafka {
  if (!kafkaClient) {
    kafkaClient = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: logLevel.WARN,
    });
  }
  return kafkaClient;
}

async function getProducer(): Promise<Producer> {
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
 * @param topic
 * @param payload
 * @param key   Optional message key (used for partitioning)
 */
export async function publishEvent(
  topic: string,
  payload: KafkaEventPayload,
  key: string | null = null
): Promise<void> {
  try {
    const prod = await getProducer();
    await prod.send({
      topic,
      messages: [
        {
          key: key ?? payload.orderId ?? null,
          value: JSON.stringify(payload),
        },
      ],
    });
    logger.debug('Kafka event published', { topic, payload });
  } catch (err) {
    logger.error('Failed to publish Kafka event', {
      topic,
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't throw — Kafka failures should be non-fatal for the order flow
  }
}

/**
 * Gracefully disconnect the producer.
 */
export async function disconnectProducer(): Promise<void> {
  if (producer && isConnected) {
    await producer.disconnect();
    isConnected = false;
    logger.info('Kafka producer disconnected');
  }
}

export { getKafkaClient };
