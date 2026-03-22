import { Router, Request, Response } from 'express';
import axios from 'axios';
import config from '../config';
import logger from '../config/logger';
import { handleMessage } from '../services/messageHandler';
import type { WhatsAppMessage, WhatsAppWebhookBody } from '../types';

const router = Router();

/**
 * GET /webhook
 * Meta Cloud API webhook verification (hub.challenge handshake).
 */
router.get('/', (req: Request, res: Response): void => {
  if (config.whatsapp.provider === 'twilio') {
    res.status(200).send('Twilio webhook ready');
    return;
  }

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
  // Acknowledge immediately — provider webhooks expect a fast 200
  res.sendStatus(200);

  if (config.whatsapp.provider === 'twilio') {
    void processTwilioWebhook(req.body as TwilioWebhookBody);
    return;
  }

  void processMetaWebhook(req.body as WhatsAppWebhookBody);
});

export default router;

interface TwilioWebhookBody {
  MessageSid?: string;
  SmsSid?: string;
  Body?: string;
  From?: string;
  WaId?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  ButtonPayload?: string;
  ButtonText?: string;
}

async function processMetaWebhook(body: WhatsAppWebhookBody): Promise<void> {
  try {
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;

        const messages = change.value.messages ?? [];

        for (const message of messages) {
          const from = message.from;
          logger.info('Inbound WhatsApp message', { from, type: message.type });
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
}

async function processTwilioWebhook(body: TwilioWebhookBody): Promise<void> {
  try {
    const message = mapTwilioBodyToWhatsAppMessage(body);
    if (!message) {
      logger.warn('Twilio webhook missing message body');
      return;
    }

    logger.info('Inbound Twilio WhatsApp message', {
      from: message.from,
      type: message.type,
    });

    await handleMessage(message, message.from);
  } catch (err) {
    const responseData = axios.isAxiosError(err) ? err.response?.data : undefined;
    logger.error('Error processing Twilio webhook payload', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      responseData,
    });
  }
}

function mapTwilioBodyToWhatsAppMessage(body: TwilioWebhookBody): WhatsAppMessage | null {
  const from =
    body.WaId ??
    (body.From ? body.From.replace(/^whatsapp:/, '').replace(/^\+/, '') : undefined);

  if (!from) return null;

  const baseMessage: WhatsAppMessage = {
    id: body.MessageSid ?? body.SmsSid ?? Date.now().toString(),
    from,
    timestamp: new Date().toISOString(),
    type: 'text',
    text: { body: body.Body ?? '' },
  };

  const numMedia = parseInt(body.NumMedia ?? '0', 10);
  const mediaContentType = body.MediaContentType0?.toLowerCase() ?? '';
  if (numMedia > 0 && body.MediaUrl0 && mediaContentType.startsWith('audio')) {
    return {
      ...baseMessage,
      type: 'audio',
      audio: { id: body.MediaUrl0, mime_type: body.MediaContentType0 },
    };
  }

  if (body.ButtonPayload || body.ButtonText) {
    return {
      ...baseMessage,
      type: 'interactive',
      interactive: {
        type: 'button',
        button_reply: {
          id: body.ButtonPayload ?? body.ButtonText ?? '',
          title: body.ButtonText ?? body.ButtonPayload ?? '',
        },
      },
    };
  }

  return baseMessage;
}
