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

interface TwilioMessageResponse {
  sid: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
}

const USES_TWILIO = config.whatsapp.provider === 'twilio';
const TWILIO_API_BASE = config.twilio.accountSid
  ? `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}`
  : undefined;

function ensureTwilioConfig(): void {
  if (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.fromNumber) {
    throw new Error(
      'Missing Twilio configuration. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM.'
    );
  }
}

function formatE164(phone: string): string {
  let value = phone.trim();
  if (value.startsWith('whatsapp:')) {
    value = value.slice('whatsapp:'.length);
  }
  if (!value.startsWith('+')) {
    value = `+${value}`;
  }
  return value;
}

async function callTwilio(MessagesParams: URLSearchParams): Promise<WhatsAppMessageResponse> {
  ensureTwilioConfig();

  if (!TWILIO_API_BASE) {
    throw new Error('Twilio API base URL is not defined.');
  }

  const to = MessagesParams.get('To');
  const from = MessagesParams.get('From');

  logger.info('Twilio API request context', {
    accountSid: config.twilio.accountSid,
    accountSidLength: config.twilio.accountSid?.length,
    apiBase: TWILIO_API_BASE,
    to,
    from,
  });

  try {
    const response = await axios.post<TwilioMessageResponse>(
      `${TWILIO_API_BASE}/Messages.json`,
      MessagesParams.toString(),
      {
        auth: {
          username: config.twilio.accountSid as string,
          password: config.twilio.authToken as string,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    logger.debug('Twilio WhatsApp message sent', {
      to,
      sid: response.data.sid,
    });

    return { messages: [{ id: response.data.sid }] };
  } catch (err) {
    const errData = axios.isAxiosError(err)
      ? err.response?.data
      : (err instanceof Error ? err.message : String(err));
    logger.error('Failed to send Twilio WhatsApp message', {
      to,
      from,
      status: axios.isAxiosError(err) ? err.response?.status : undefined,
      error: errData,
    });
    throw err;
  }
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
  if (USES_TWILIO) {
    ensureTwilioConfig();
    const fromNumber = config.twilio.fromNumber as string;

    const params = new URLSearchParams({
      To: `whatsapp:${formatE164(to)}`,
      From: `whatsapp:${formatE164(fromNumber)}`,
      Body: body,
    });

    return callTwilio(params);
  }

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
  if (USES_TWILIO) {
    const options = buttons
      .map((btn, idx) => `${idx + 1}. ${btn.title}`)
      .join('\n');
    const fallback = `${bodyText}\n\n${options}\n\nReply with the option text or number.`;
    return sendTextMessage(to, fallback);
  }

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
  if (USES_TWILIO) {
    const options = rows
      .map((row, idx) => {
        const description = row.description ? ` - ${row.description}` : '';
        return `${idx + 1}. ${row.title}${description}`;
      })
      .join('\n');
    const fallback = `${bodyText}\n\n${options}\n\nReply with the item number or title.`;
    return sendTextMessage(to, fallback);
  }

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
  if (USES_TWILIO) {
    ensureTwilioConfig();
    if (!TWILIO_API_BASE) {
      throw new Error('Twilio API base URL is not defined.');
    }

    const mediaUrl = mediaId.startsWith('http')
      ? mediaId
      : `${TWILIO_API_BASE}/Messages/${mediaId}/Media`;

    const mediaResp = await axios.get<ArrayBuffer>(mediaUrl, {
      auth: {
        username: config.twilio.accountSid as string,
        password: config.twilio.authToken as string,
      },
      responseType: 'arraybuffer',
    });

    const mimeType =
      (mediaResp.headers['content-type'] as string | undefined) ?? 'application/octet-stream';

    return { buffer: Buffer.from(mediaResp.data), mimeType };
  }

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
