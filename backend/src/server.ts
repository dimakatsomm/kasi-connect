import app from './app';
import config from './config';
import logger from './config/logger';
import { startConsumer } from './kafka/consumer';
import { disconnectProducer } from './kafka/producer';

const PORT = config.port;

async function start(): Promise<void> {
  // Start Kafka consumer (non-fatal if Kafka is not available in dev)
  try {
    await startConsumer();
  } catch (err) {
    logger.warn('Kafka consumer failed to start (non-fatal in dev)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const server = app.listen(PORT, () => {
    logger.info(`KasiConnect backend listening on port ${PORT}`, {
      env: config.env,
      port: PORT,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      try {
        await disconnectProducer();
      } catch {
        // ignore
      }
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err: Error) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
