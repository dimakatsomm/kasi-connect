import axios from 'axios';
import config from '../config';
import logger from '../config/logger';

interface WhatsAppButton {
  id: string;
  title: string;
}

interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

interface WhatsAppMessageResponse {
  messages?: Array<{ id: string }>;
}

/**
 * Send a plain text WhatsApp message via Meta Cloud API.
 *
 * @param to    Recipient phone in E.164 format (e.g. "27821234567")
 * @param body  Message text
 */
export async function sendTextMessage(
  to: string,
  body: string
): Promise<WhatsAppMessageResponse> {
  const url = `${config.whatsapp.apiBaseUrl}/${config.whatsapp.phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  };

  try {
    const response = await axios.post<WhatsAppMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    logger.debug('WhatsApp message sent', {
      to,
      messageId: response.data?.messages?.[0]?.id,
    });
    return response.data;
  } catch (err) {
    const errData =
      axios.isAxiosError(err) ? (err.response?.data as unknown) : (err instanceof Error ? err.message : String(err));
    logger.error('Failed to send WhatsApp message', { to, error: errData });
    throw err;
  }
}

/**
 * Send an interactive button message (up to 3 buttons).
 *
 * @param to
 * @param bodyText
 * @param buttons
 */
export async function sendButtonMessage(
  to: string,
  bodyText: string,
  buttons: WhatsAppButton[]
): Promise<WhatsAppMessageResponse> {
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
    const response = await axios.post<WhatsAppMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    logger.debug('WhatsApp button message sent', { to });
    return response.data;
  } catch (err) {
    const errData =
      axios.isAxiosError(err) ? (err.response?.data as unknown) : (err instanceof Error ? err.message : String(err));
    logger.error('Failed to send WhatsApp button message', { to, error: errData });
    throw err;
  }
}

/**
 * Send a list message (for menu / product selection).
 *
 * @param to
 * @param bodyText
 * @param buttonLabel  Label on the list button
 * @param rows
 */
export async function sendListMessage(
  to: string,
  bodyText: string,
  buttonLabel: string,
  rows: WhatsAppListRow[]
): Promise<WhatsAppMessageResponse> {
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
              description: r.description ?? '',
            })),
          },
        ],
      },
    },
  };

  try {
    const response = await axios.post<WhatsAppMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    logger.debug('WhatsApp list message sent', { to });
    return response.data;
  } catch (err) {
    const errData =
      axios.isAxiosError(err) ? (err.response?.data as unknown) : (err instanceof Error ? err.message : String(err));
    logger.error('Failed to send WhatsApp list message', { to, error: errData });
    throw err;
  }
}

/**
 * Download a media file (voice note) by its WhatsApp media ID.
 * Returns the media as a Buffer.
 *
 * @param mediaId
 */
export async function downloadMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  // First, get the media URL
  const metaUrl = `${config.whatsapp.apiBaseUrl}/${mediaId}`;
  const metaResp = await axios.get<{ url: string; mime_type: string }>(metaUrl, {
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
  });
  const mediaUrl = metaResp.data.url;
  const mimeType = metaResp.data.mime_type;

  // Then download the actual media
  const mediaResp = await axios.get<ArrayBuffer>(mediaUrl, {
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
    responseType: 'arraybuffer',
  });

  return { buffer: Buffer.from(mediaResp.data), mimeType };
}
