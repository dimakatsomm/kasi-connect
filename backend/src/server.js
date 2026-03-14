'use strict';

require('dotenv').config();

const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');
const { startConsumer } = require('./kafka/consumer');

const PORT = config.port;

async function start() {
  // Start Kafka consumer (non-fatal if Kafka is not available in dev)
  try {
    await startConsumer();
  } catch (err) {
    logger.warn('Kafka consumer failed to start (non-fatal in dev)', { error: err.message });
  }

  const server = app.listen(PORT, () => {
    logger.info(`KasiConnect backend listening on port ${PORT}`, {
      env: config.env,
      port: PORT,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      try {
        const { disconnectProducer } = require('./kafka/producer');
        await disconnectProducer();
      } catch (_) { /* ignore */ }
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
