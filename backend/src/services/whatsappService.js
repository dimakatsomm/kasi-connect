'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Send a plain text WhatsApp message via Meta Cloud API.
 *
 * @param {string} to    Recipient phone in E.164 format (e.g. "27821234567")
 * @param {string} body  Message text
 */
async function sendTextMessage(to, body) {
  const url = `${config.whatsapp.apiBaseUrl}/${config.whatsapp.phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    logger.debug('WhatsApp message sent', { to, messageId: response.data?.messages?.[0]?.id });
    return response.data;
  } catch (err) {
    const errData = err.response?.data || err.message;
    logger.error('Failed to send WhatsApp message', { to, error: errData });
    throw err;
  }
}

/**
 * Send an interactive button message (up to 3 buttons).
 *
 * @param {string} to
 * @param {string} bodyText
 * @param {Array<{ id: string, title: string }>} buttons
 */
async function sendButtonMessage(to, bodyText, buttons) {
  const url = `${config.whatsapp.apiBaseUrl}/${config.whatsapp.phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title },
        })),
      },
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    logger.debug('WhatsApp button message sent', { to });
    return response.data;
  } catch (err) {
    logger.error('Failed to send WhatsApp button message', { to, error: err.response?.data || err.message });
    throw err;
  }
}

/**
 * Send a list message (for menu / product selection).
 *
 * @param {string} to
 * @param {string} bodyText
 * @param {string} buttonLabel  Label on the list button
 * @param {Array<{ id: string, title: string, description?: string }>} rows
 */
async function sendListMessage(to, bodyText, buttonLabel, rows) {
  const url = `${config.whatsapp.apiBaseUrl}/${config.whatsapp.phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: [
          {
            title: 'Items',
            rows: rows.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description || '',
            })),
          },
        ],
      },
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    logger.debug('WhatsApp list message sent', { to });
    return response.data;
  } catch (err) {
    logger.error('Failed to send WhatsApp list message', { to, error: err.response?.data || err.message });
    throw err;
  }
}

/**
 * Download a media file (voice note) by its WhatsApp media ID.
 * Returns the media as a Buffer.
 *
 * @param {string} mediaId
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function downloadMedia(mediaId) {
  // First, get the media URL
  const metaUrl = `${config.whatsapp.apiBaseUrl}/${mediaId}`;
  const metaResp = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
  });
  const mediaUrl = metaResp.data.url;
  const mimeType = metaResp.data.mime_type;

  // Then download the actual media
  const mediaResp = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
    responseType: 'arraybuffer',
  });

  return { buffer: Buffer.from(mediaResp.data), mimeType };
}

module.exports = { sendTextMessage, sendButtonMessage, sendListMessage, downloadMedia };
