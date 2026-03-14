'use strict';

const express = require('express');
const config = require('../config');
const logger = require('../config/logger');
const { handleMessage } = require('../services/messageHandler');

const router = express.Router();

/**
 * GET /webhook
 * Meta Cloud API webhook verification (hub.challenge handshake).
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  logger.warn('WhatsApp webhook verification failed', { mode, token });
  return res.sendStatus(403);
});

/**
 * POST /webhook
 * Receive inbound WhatsApp messages.
 */
router.post('/', async (req, res) => {
  // Acknowledge immediately — Meta requires a 200 within 5 seconds
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value.messages || [];

        for (const message of messages) {
          const from = message.from; // E.164 without '+', e.g. "27821234567"
          logger.info('Inbound WhatsApp message', { from, type: message.type });
          // Process asynchronously — do not await so we don't block the response
          handleMessage(message, from).catch((err) => {
            logger.error('Unhandled error in message handler', {
              from,
              error: err.message,
            });
          });
        }
      }
    }
  } catch (err) {
    logger.error('Error processing webhook payload', { error: err.message });
  }
});

module.exports = router;
