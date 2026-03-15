import { Router, Request, Response } from 'express';
import config from '../config';
import logger from '../config/logger';
import { handleMessage } from '../services/messageHandler';
import type { WhatsAppWebhookBody } from '../types';

const router = Router();

/**
 * GET /webhook
 * Meta Cloud API webhook verification (hub.challenge handshake).
 */
router.get('/', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('WhatsApp webhook verification failed', { mode, token });
  res.sendStatus(403);
});

/**
 * POST /webhook
 * Receive inbound WhatsApp messages.
 */
router.post('/', (req: Request, res: Response): void => {
  // Acknowledge immediately — Meta requires a 200 within 5 seconds
  res.sendStatus(200);

  void (async () => {
    try {
      const body = req.body as WhatsAppWebhookBody;

      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== 'messages') continue;

          const messages = change.value.messages ?? [];

          for (const message of messages) {
            const from = message.from;
            logger.info('Inbound WhatsApp message', { from, type: message.type });
            // Process asynchronously — do not await so we don't block the response
            handleMessage(message, from).catch((err: Error) => {
              logger.error('Unhandled error in message handler', {
                from,
                error: err.message,
              });
            });
          }
        }
      }
    } catch (err) {
      logger.error('Error processing webhook payload', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});

export default router;
